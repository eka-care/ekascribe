"""OIDC login (AUTH_MODE=oidc): authorization code + PKCE, built on Authlib.

The IdP establishes *who*; vaarta still mints its own session, so everything
downstream (jwt-payload injection, auto-refresh, rotation, ownership checks)
is unchanged.

Authlib's ``AsyncOAuth2Client`` drives the protocol (authorization URL, PKCE
challenge, token exchange, client authentication) and ``joserfc`` — Authlib's
own JOSE library, which ``authlib.jose`` now defers to — validates the
id_token against the IdP's JWKS.

Stateless by design: ``state``, ``nonce``, the PKCE verifier and the return
path travel in a short-lived signed cookie rather than a server-side session,
so any pod can serve the callback (no Redis, no sticky sessions, and no
Starlette SessionMiddleware).

Config (env): OIDC_ISSUER (+ optional OIDC_DISCOVERY_URL override),
OIDC_CLIENT_ID, OIDC_CLIENT_SECRET (omit for a public client),
OIDC_REDIRECT_URL, OIDC_SCOPES, claim mapping, TLS options.
"""

from __future__ import annotations

import logging
import secrets
import time
from typing import Any, Dict, Optional, Tuple

from scribe_core.settings import get_settings

logger = logging.getLogger(__name__)

TX_ALGO = "HS256"
_DISCOVERY_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_JWKS_CACHE: Dict[str, Tuple[float, Any]] = {}
_DISCOVERY_TTL = 3600.0
_JWKS_TTL = 3600.0
_LEEWAY = 60  # clock skew allowance when validating the id_token


class OIDCError(Exception):
    """Login could not be completed (config, network, or token validation)."""


def _http_verify():
    """httpx verify= value: a CA bundle path wins over the boolean toggle."""
    s = get_settings()
    return s.oidc_ca_bundle or s.oidc_verify_ssl


def _client(**kwargs):
    """Authlib OAuth2 client carrying our TLS + timeout settings.
    ``client_secret_post`` is the most broadly accepted confidential-client
    auth; a client with no secret is a public client (PKCE only).
    """
    from authlib.integrations.httpx_client import AsyncOAuth2Client
    s = get_settings()
    return AsyncOAuth2Client(
        client_id=s.oidc_client_id,
        client_secret=s.oidc_client_secret,
        redirect_uri=s.oidc_redirect_url,
        scope=s.oidc_scopes,
        code_challenge_method="S256",
        token_endpoint_auth_method=(
            "client_secret_post" if s.oidc_client_secret else "none"
        ),
        verify=_http_verify(),
        timeout=s.oidc_request_timeout_s,
        **kwargs,
    )


def discovery_url() -> str:
    s = get_settings()
    if s.oidc_discovery_url:
        return s.oidc_discovery_url
    if not s.oidc_issuer:
        raise OIDCError("OIDC_ISSUER (or OIDC_DISCOVERY_URL) is not configured")
    return f"{s.oidc_issuer.rstrip('/')}/.well-known/openid-configuration"


async def discovery(force: bool = False) -> Dict[str, Any]:
    """OIDC discovery document, cached for an hour."""
    url = discovery_url()
    hit = _DISCOVERY_CACHE.get(url)
    if hit and not force and hit[0] > time.time():
        return hit[1]
    try:
        async with _client() as client:
            resp = await client.request("GET", url, withhold_token=True)
        resp.raise_for_status()
        doc = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"OIDC discovery failed ({url}): {exc}") from exc
    _DISCOVERY_CACHE[url] = (time.time() + _DISCOVERY_TTL, doc)
    return doc


async def _key_set(force: bool = False):
    """IdP signing keys as a joserfc KeySet (kid resolution is built in)."""
    from joserfc.jwk import KeySet

    doc = await discovery()
    uri = doc.get("jwks_uri")
    if not uri:
        raise OIDCError("discovery document has no jwks_uri")
    hit = _JWKS_CACHE.get(uri)
    if hit and not force and hit[0] > time.time():
        return hit[1]
    try:
        async with _client() as client:
            resp = await client.request("GET", uri, withhold_token=True)
        resp.raise_for_status()
        keys = KeySet.import_key_set(resp.json())
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"JWKS fetch failed ({uri}): {exc}") from exc
    _JWKS_CACHE[uri] = (time.time() + _JWKS_TTL, keys)
    return keys


# --- transaction cookie (state / nonce / PKCE verifier / return path) ---------


def mint_tx_token(next_path: str) -> Tuple[str, Dict[str, str]]:
    """Signed login-transaction token + the values used in the redirect."""
    import jwt as pyjwt  # our own HS256 session/tx signing

    s = get_settings()
    if not s.auth_jwt_secret:
        raise OIDCError("AUTH_JWT_SECRET is required to sign the OIDC transaction")
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    # Authlib generates a spec-compliant verifier; the challenge is derived by
    # create_authorization_url() from code_challenge_method="S256".
    verifier = secrets.token_urlsafe(48)
    now = int(time.time())
    token = pyjwt.encode(
        {
            "state": state,
            "nonce": nonce,
            "cv": verifier,
            "next": next_path or "/",
            "iat": now,
            "exp": now + s.oidc_tx_ttl_seconds,
        },
        s.auth_jwt_secret,
        algorithm=TX_ALGO,
    )
    return token, {"state": state, "nonce": nonce, "code_verifier": verifier}


def verify_tx_token(token: str) -> Dict[str, Any]:
    import jwt as pyjwt

    s = get_settings()
    try:
        return pyjwt.decode(token, s.auth_jwt_secret or "", algorithms=[TX_ALGO])
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"login transaction invalid or expired: {exc}") from exc


def safe_next_path(raw: Optional[str]) -> str:
    """Only same-site absolute paths — never an attacker-supplied redirect."""
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return "/"
    return raw


async def authorization_redirect_url(next_path: str) -> Tuple[str, str]:
    """(url to send the browser to, tx token to set as a cookie)."""
    s = get_settings()
    if not s.oidc_client_id or not s.oidc_redirect_url:
        raise OIDCError("OIDC_CLIENT_ID and OIDC_REDIRECT_URL must be configured")
    doc = await discovery()
    endpoint = doc.get("authorization_endpoint")
    if not endpoint:
        raise OIDCError("discovery document has no authorization_endpoint")

    tx_token, vals = mint_tx_token(safe_next_path(next_path))
    async with _client() as client:
        url, _state = client.create_authorization_url(
            endpoint,
            state=vals["state"],
            code_verifier=vals["code_verifier"],
            nonce=vals["nonce"],
        )
    return url, tx_token


async def exchange_code(code: str, code_verifier: str) -> Dict[str, Any]:
    """Authorization code -> tokens (Authlib applies PKCE + client auth)."""
    doc = await discovery()
    endpoint = doc.get("token_endpoint")
    if not endpoint:
        raise OIDCError("discovery document has no token_endpoint")
    try:
        async with _client() as client:
            token = await client.fetch_token(
                endpoint,
                grant_type="authorization_code",
                code=code,
                code_verifier=code_verifier,
            )
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"token exchange failed: {exc}") from exc
    return dict(token)


async def validate_id_token(id_token: str, nonce: str) -> Dict[str, Any]:
    """Signature (JWKS), iss, aud, exp and nonce — all enforced."""
    from joserfc import jwt as jose_jwt
    from joserfc.errors import JoseError
    s = get_settings()
    doc = await discovery()
    issuer = s.oidc_issuer or doc.get("issuer")
    algorithms = doc.get("id_token_signing_alg_values_supported") or [
        "RS256",
        "ES256",
    ]

    token = None
    last_error: Optional[Exception] = None
    # An unknown kid means the IdP rotated keys: refetch the set once.
    for force in (False, True):
        keys = await _key_set(force=force)
        try:
            token = jose_jwt.decode(id_token, keys, algorithms=list(algorithms))
            break
        except JoseError as exc:
            last_error = exc
        except Exception as exc:  # noqa: BLE001 — malformed token, bad key, ...
            last_error = exc
    if token is None:
        raise OIDCError(f"id_token signature validation failed: {last_error}")

    claims = dict(token.claims)
    registry = jose_jwt.JWTClaimsRegistry(
        leeway=_LEEWAY,
        iss={"essential": True, "value": issuer},
        aud={"essential": True, "value": s.oidc_client_id},
        exp={"essential": True},
    )
    try:
        registry.validate(claims)
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"id_token claim validation failed: {exc}") from exc

    if claims.get("nonce") != nonce:
        raise OIDCError("id_token nonce mismatch (replay?)")
    return claims


async def userinfo(access_token: str) -> Dict[str, Any]:
    """Optional extra claims; failures are non-fatal."""
    try:
        doc = await discovery()
        endpoint = doc.get("userinfo_endpoint")
        if not endpoint:
            return {}
        async with _client() as client:
            resp = await client.request(
                "GET",
                endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
                withhold_token=True,  # we set the header ourselves
            )
        return resp.json() if resp.status_code == 200 else {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("userinfo call failed (ignored): %s", exc)
        return {}


def upsert_oidc_user(claims: Dict[str, Any]) -> Dict[str, Any]:
    """Map IdP claims onto our users row (claim names are env-configurable)."""
    from scribe_core.db import ConditionalCheckFailed, get_table
    s = get_settings()
    subject = str(claims.get(s.oidc_claim_uuid) or claims.get("sub") or "").strip()
    username = str(claims.get(s.oidc_claim_username) or "").strip().lower()
    if not username:
        username = subject  # IdP without an email scope: fall back to the subject
    display = str(claims.get(s.oidc_claim_name) or username).strip()
    if not subject or not username:
        raise OIDCError("id_token is missing the configured identity claims")

    users = get_table("users")
    row = users.get_item({"username": username})
    if row:
        return row
    user = {
        "username": username,
        "display_name": display,
        "uuid": subject,
        "oid": username,
        "b_id": s.dev_b_id,
        "is_active": True,
        "oidc": True,
        "created_at": int(time.time()),
    }
    try:
        users.put_item(user, if_not_exists=True)
    except ConditionalCheckFailed:
        return users.get_item({"username": username})
    logger.info("OIDC user provisioned: %s", username)
    return user


async def end_session_url() -> Optional[str]:
    """RP-initiated logout URL (client_id + post_logout_redirect_uri — no
    id_token_hint, so we never store IdP tokens at rest)."""
    from urllib.parse import urlencode

    s = get_settings()
    try:
        doc = await discovery()
    except OIDCError:
        return None
    endpoint = doc.get("end_session_endpoint")
    if not endpoint:
        return None
    params = {"client_id": s.oidc_client_id or ""}
    if s.oidc_post_logout_redirect:
        params["post_logout_redirect_uri"] = s.oidc_post_logout_redirect
    sep = "&" if "?" in endpoint else "?"
    return f"{endpoint}{sep}{urlencode(params)}"
