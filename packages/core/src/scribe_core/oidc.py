"""Provider-aware login flows: OIDC and plain OAuth2, built on Authlib.

Which provider a request belongs to is carried in the URL
(``/{oidc|oauth}/{provider}/...``, mounted at the app root) and baked into
the signed transaction cookie, so several providers can coexist. Providers
come from ``scribe_core.providers`` (AUTH_PROVIDERS env, or the legacy
OIDC_* vars).

Two identity mechanisms:

* ``type: oidc`` — authorization code + PKCE; the id_token is validated
  against the IdP's JWKS (signature, iss, aud, exp, nonce, azp).
* ``type: oauth2`` — authorization code + PKCE, but no id_token: identity
  comes from a mandatory userinfo endpoint called with the access token
  (Parichay style).

Either way the IdP only establishes *who*; vaarta still mints its own
session, so everything downstream (jwt-payload injection, auto-refresh,
rotation, ownership checks) is unchanged.

Stateless by design: ``state``, ``nonce``, the PKCE verifier, the provider id
and the return path travel in a short-lived signed cookie rather than a
server-side session, so any pod can serve the callback (no Redis, no sticky
sessions, and no Starlette SessionMiddleware).
"""

from __future__ import annotations

import logging
import secrets
import time
from typing import Any, Dict, Optional, Tuple

from scribe_core.providers import ProviderConfig
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


def _http_verify(p: ProviderConfig):
    """httpx verify= value: a CA bundle path wins over the boolean toggle."""
    return p.ca_bundle or p.verify_ssl


def _client(p: ProviderConfig, **kwargs):
    """Authlib OAuth2 client carrying the provider's TLS + timeout settings.
    ``client_secret_post`` is the most broadly accepted confidential-client
    auth (override per provider with token_auth_method); a client with no
    secret is a public client (PKCE only).
    """
    from authlib.integrations.httpx_client import AsyncOAuth2Client

    return AsyncOAuth2Client(
        client_id=p.client_id,
        client_secret=p.client_secret,
        redirect_uri=p.effective_redirect_url(),
        scope=p.scopes,
        code_challenge_method="S256" if p.use_pkce else None,
        token_endpoint_auth_method=p.effective_token_auth_method(),
        verify=_http_verify(p),
        timeout=p.request_timeout_s,
        **kwargs,
    )


def discovery_url(p: ProviderConfig) -> str:
    if p.discovery_url:
        return p.discovery_url
    if not p.issuer:
        raise OIDCError(f"provider '{p.id}': issuer (or discovery_url) is not configured")
    return f"{p.issuer.rstrip('/')}/.well-known/openid-configuration"


async def discovery(p: ProviderConfig, force: bool = False) -> Dict[str, Any]:
    """OIDC discovery document, cached for an hour (oidc providers only)."""
    url = discovery_url(p)
    hit = _DISCOVERY_CACHE.get(url)
    if hit and not force and hit[0] > time.time():
        return hit[1]
    try:
        async with _client(p) as client:
            resp = await client.request("GET", url, withhold_token=True)
        resp.raise_for_status()
        doc = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"OIDC discovery failed ({url}): {exc}") from exc
    # Mix-up defence: the document must belong to the issuer we asked about.
    if p.issuer and doc.get("issuer") and doc["issuer"].rstrip("/") != p.issuer.rstrip("/"):
        raise OIDCError(
            f"discovery issuer mismatch: expected {p.issuer}, got {doc.get('issuer')}"
        )
    _DISCOVERY_CACHE[url] = (time.time() + _DISCOVERY_TTL, doc)
    return doc


async def endpoints(p: ProviderConfig) -> Dict[str, Optional[str]]:
    """Resolved endpoints. oauth2: straight from config. oidc: discovery,
    with any explicitly configured endpoint taking precedence."""
    doc: Dict[str, Any] = {}
    if p.type == "oidc" and (p.issuer or p.discovery_url):
        doc = await discovery(p)
    return {
        "authorization_endpoint": p.authorization_endpoint
        or doc.get("authorization_endpoint"),
        "token_endpoint": p.token_endpoint or doc.get("token_endpoint"),
        "userinfo_endpoint": p.userinfo_endpoint or doc.get("userinfo_endpoint"),
        "end_session_endpoint": p.end_session_endpoint
        or doc.get("end_session_endpoint"),
    }


async def _key_set(p: ProviderConfig, force: bool = False):
    """IdP signing keys as a joserfc KeySet (kid resolution is built in)."""
    from joserfc.jwk import KeySet

    doc = await discovery(p)
    uri = doc.get("jwks_uri")
    if not uri:
        raise OIDCError("discovery document has no jwks_uri")
    hit = _JWKS_CACHE.get(uri)
    if hit and not force and hit[0] > time.time():
        return hit[1]
    try:
        async with _client(p) as client:
            resp = await client.request("GET", uri, withhold_token=True)
        resp.raise_for_status()
        keys = KeySet.import_key_set(resp.json())
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"JWKS fetch failed ({uri}): {exc}") from exc
    _JWKS_CACHE[uri] = (time.time() + _JWKS_TTL, keys)
    return keys


# --- transaction cookie (provider / state / nonce / PKCE verifier / next) -----


def mint_tx_token(p: ProviderConfig, next_path: str) -> Tuple[str, Dict[str, str]]:
    """Signed login-transaction token + the values used in the redirect."""
    import jwt as pyjwt  # our own HS256 session/tx signing

    s = get_settings()
    if not s.auth_jwt_secret:
        raise OIDCError("AUTH_JWT_SECRET is required to sign the login transaction")
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    # RFC 7636 verifier (43-128 chars); the S256 challenge is derived by
    # Authlib's create_authorization_url() from code_challenge_method.
    verifier = secrets.token_urlsafe(48) if p.use_pkce else ""
    now = int(time.time())
    token = pyjwt.encode(
        {
            "p": p.id,  # which provider this transaction belongs to
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


def verify_tx_token(token: str, provider_id: str) -> Dict[str, Any]:
    """Decode the transaction and require it to belong to *this* provider —
    a callback for provider A can never complete a login started at B."""
    import jwt as pyjwt

    s = get_settings()
    try:
        tx = pyjwt.decode(token, s.auth_jwt_secret or "", algorithms=[TX_ALGO])
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"login transaction invalid or expired: {exc}") from exc
    if tx.get("p") != provider_id:
        raise OIDCError(
            f"login transaction was started for provider "
            f"'{tx.get('p')}', not '{provider_id}'"
        )
    return tx


def safe_next_path(raw: Optional[str]) -> str:
    """Only same-site absolute paths — never an attacker-supplied redirect."""
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return "/"
    return raw


async def authorization_redirect_url(
    p: ProviderConfig, next_path: str
) -> Tuple[str, str]:
    """(url to send the browser to, tx token to set as a cookie)."""
    eps = await endpoints(p)
    endpoint = eps["authorization_endpoint"]
    if not endpoint:
        raise OIDCError(f"provider '{p.id}' has no authorization_endpoint")

    tx_token, vals = mint_tx_token(p, safe_next_path(next_path))
    extra: Dict[str, Any] = {"state": vals["state"]}
    if p.use_pkce:
        extra["code_verifier"] = vals["code_verifier"]
    if p.type == "oidc":
        extra["nonce"] = vals["nonce"]
    async with _client(p) as client:
        url, _state = client.create_authorization_url(endpoint, **extra)
    return url, tx_token


async def exchange_code(
    p: ProviderConfig, code: str, code_verifier: str
) -> Dict[str, Any]:
    """Authorization code -> tokens (Authlib applies PKCE + client auth)."""
    eps = await endpoints(p)
    endpoint = eps["token_endpoint"]
    if not endpoint:
        raise OIDCError(f"provider '{p.id}' has no token_endpoint")
    kwargs: Dict[str, Any] = {}
    if p.use_pkce and code_verifier:
        kwargs["code_verifier"] = code_verifier
    try:
        async with _client(p) as client:
            token = await client.fetch_token(
                endpoint,
                grant_type="authorization_code",
                code=code,
                **kwargs,
            )
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"token exchange failed: {exc}") from exc
    return dict(token)


async def validate_id_token(
    p: ProviderConfig, id_token: str, nonce: str
) -> Dict[str, Any]:
    """Signature (JWKS), iss, aud, exp, nonce and azp — all enforced."""
    from joserfc import jwt as jose_jwt
    from joserfc.errors import JoseError

    doc = await discovery(p)
    issuer = p.issuer or doc.get("issuer")
    algorithms = doc.get("id_token_signing_alg_values_supported") or [
        "RS256",
        "ES256",
    ]

    token = None
    last_error: Optional[Exception] = None
    # An unknown kid means the IdP rotated keys: refetch the set once.
    for force in (False, True):
        keys = await _key_set(p, force=force)
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
        aud={"essential": True, "value": p.client_id},
        exp={"essential": True},
    )
    try:
        registry.validate(claims)
    except Exception as exc:  # noqa: BLE001
        raise OIDCError(f"id_token claim validation failed: {exc}") from exc

    # OIDC Core 3.1.3.7: azp, when present, MUST be our client_id.
    azp = claims.get("azp")
    if azp is not None and azp != p.client_id:
        raise OIDCError("id_token azp does not match client_id")

    if claims.get("nonce") != nonce:
        raise OIDCError("id_token nonce mismatch (replay?)")
    return claims


async def userinfo(
    p: ProviderConfig, access_token: str, required: bool = False
) -> Dict[str, Any]:
    """Claims from the userinfo endpoint. Optional extras for oidc;
    the *only* identity source for oauth2 (required=True)."""
    try:
        eps = await endpoints(p)
        endpoint = eps["userinfo_endpoint"]
        if not endpoint:
            if required:
                raise OIDCError(f"provider '{p.id}' has no userinfo_endpoint")
            return {}
        async with _client(p) as client:
            resp = await client.request(
                "GET",
                endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
                withhold_token=True,  # we set the header ourselves
            )
        if resp.status_code != 200:
            if required:
                raise OIDCError(
                    f"userinfo returned {resp.status_code}: {resp.text[:200]}"
                )
            return {}
        data = resp.json()
        if not isinstance(data, dict):
            raise OIDCError("userinfo response is not a JSON object")
        return data
    except OIDCError:
        raise
    except Exception as exc:  # noqa: BLE001
        if required:
            raise OIDCError(f"userinfo call failed: {exc}") from exc
        logger.warning("userinfo call failed (ignored): %s", exc)
        return {}


async def identity_claims(
    p: ProviderConfig, tokens: Dict[str, Any], nonce: str
) -> Dict[str, Any]:
    """Establish who logged in, per the provider's mechanism."""
    if p.type == "oidc":
        id_token = tokens.get("id_token")
        if not id_token:
            raise OIDCError("token response has no id_token")
        return await validate_id_token(p, id_token, nonce)
    # oauth2: no id_token exists; the access token + userinfo endpoint is the
    # identity. The token arrived over TLS directly from the token endpoint
    # (with PKCE binding the code to this transaction), so it is trustworthy.
    access_token = tokens.get("access_token")
    if not access_token:
        raise OIDCError("token response has no access_token")
    return await userinfo(p, access_token, required=True)


def upsert_provider_user(p: ProviderConfig, claims: Dict[str, Any]) -> Dict[str, Any]:
    """Map provider claims onto our users row (claim names per provider)."""
    from scribe_core.db import ConditionalCheckFailed, get_table

    s = get_settings()
    subject = str(claims.get(p.claim_uuid) or claims.get("sub") or "").strip()
    username = str(claims.get(p.claim_username) or "").strip().lower()
    if not username:
        username = subject  # provider without an email scope: use the subject
    display = str(claims.get(p.claim_name) or username).strip()
    if not subject or not username:
        raise OIDCError(
            f"provider '{p.id}' response is missing the configured identity "
            f"claims ({p.claim_uuid!r}/{p.claim_username!r})"
        )

    users = get_table("users")
    row = users.get_item({"username": username})
    if row:
        return row
    user = {
        "username": username,
        "display_name": display,
        "uuid": subject,
        "oid": username,
        "b_id": s.workspace_id,
        "is_active": True,
        "oidc": True,
        "auth_provider": p.id,
        "created_at": int(time.time()),
    }
    try:
        users.put_item(user, if_not_exists=True)
    except ConditionalCheckFailed:
        return users.get_item({"username": username})
    logger.info("SSO user provisioned via %s: %s", p.id, username)
    return user


async def end_session_url(p: ProviderConfig) -> Optional[str]:
    """RP-initiated logout URL (client_id + post_logout_redirect_uri — no
    id_token_hint, so we never store IdP tokens at rest)."""
    from urllib.parse import urlencode

    try:
        eps = await endpoints(p)
    except OIDCError:
        return None
    endpoint = eps["end_session_endpoint"]
    if not endpoint:
        return None
    params = {"client_id": p.client_id or ""}
    if p.post_logout_redirect:
        params["post_logout_redirect_uri"] = p.post_logout_redirect
    sep = "&" if "?" in endpoint else "?"
    return f"{endpoint}{sep}{urlencode(params)}"
