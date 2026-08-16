"""Provider-scoped SSO login endpoints (OIDC + plain OAuth2), mounted at the
app root.

GET /oidc/{provider}/login      -> 302 to the IdP
GET /oidc/{provider}/callback   -> validate id_token, provision, set session
GET /oidc/{provider}/logout     -> revoke + IdP end_session hop
GET /oauth/{provider}/login     -> 302 to the provider
GET /oauth/{provider}/callback  -> exchange code, identity via userinfo,
                                   set session
GET /oauth/{provider}/logout    -> revoke + clear cookies

The provider id in the path selects a provider from AUTH_PROVIDERS (see
scribe_core/providers.py); the /oidc/ vs /oauth/ URL family must match the
provider's configured type (/oauth/ serves type "oauth2" — the URL uses the
conventional short segment, the config keeps the protocol's real name).
State, nonce, the PKCE verifier and the provider id travel in a signed,
short-lived cookie, so any pod can serve the callback.

All routes sit outside the auth middleware's guarded prefixes; everything
after the callback runs on the ordinary vaarta session.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request
from starlette.responses import RedirectResponse

from scribe_core.auth import (
    cookie_domain,
    issue_refresh_token,
    mint_session_token,
    principal_from_user,
    revoke_refresh_token,
)
from scribe_core.oidc import (
    OIDCError,
    authorization_redirect_url,
    end_session_url,
    exchange_code,
    identity_claims,
    safe_next_path,
    upsert_provider_user,
    verify_tx_token,
)
from scribe_core.providers import ProviderConfig, UnknownProvider, get_provider
from scribe_core.settings import get_settings

from scribe.core.custom_logger import get_logger
from scribe.core.http import ResponseFormatter

logger = get_logger(__name__)

oidc_router = APIRouter()


def _tx_cookie_kwargs() -> dict:
    s = get_settings()
    return dict(
        max_age=s.oidc_tx_ttl_seconds,
        httponly=True,
        secure=s.auth_cookie_secure,
        samesite="lax",  # must survive the IdP's top-level redirect back
        domain=cookie_domain(),
        path="/",
    )


def _session_cookie_kwargs() -> dict:
    s = get_settings()
    return dict(
        max_age=s.auth_refresh_ttl_seconds,
        httponly=True,
        secure=s.auth_cookie_secure,
        samesite="lax",
        domain=cookie_domain(),
        path="/",
    )


def _resolve(provider_id: str, family: str) -> ProviderConfig:
    """Path -> provider, or raise UnknownProvider (handled as 404)."""
    return get_provider(provider_id, family=family)


def _unknown_provider(provider_id: str, family: str):
    return ResponseFormatter.error(
        code="unknown_provider",
        message=f"no {family} provider named '{provider_id}' is configured",
        status_code=404,
    )


# --- shared handlers ----------------------------------------------------------


async def _login(family: str, provider_id: str, next_path: Optional[str]):
    """Start the authorization-code flow for one provider."""
    s = get_settings()
    try:
        p = _resolve(provider_id, family)
    except UnknownProvider:
        return _unknown_provider(provider_id, family)
    try:
        url, tx_token = await authorization_redirect_url(p, safe_next_path(next_path))
    except OIDCError as e:
        logger.error(
            "SSO login could not start",
            provider=provider_id,
            error=str(e),
            severity="high",
        )
        return ResponseFormatter.error(
            code="sso_misconfigured", message=str(e), status_code=500
        )
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(s.oidc_tx_cookie_name, tx_token, **_tx_cookie_kwargs())
    return response


async def _callback(
    family: str,
    provider_id: str,
    request: Request,
    code: Optional[str],
    state: Optional[str],
    error: Optional[str],
    error_description: Optional[str],
):
    """Finish the flow: validate, provision, and drop our session cookies."""
    s = get_settings()
    try:
        p = _resolve(provider_id, family)
    except UnknownProvider:
        return _unknown_provider(provider_id, family)

    if error:
        logger.warning(
            "provider returned an error",
            provider=provider_id,
            error=error,
            detail=error_description,
        )
        return ResponseFormatter.error(
            code="sso_error",
            message=error_description or error,
            status_code=401,
        )
    if not code or not state:
        return ResponseFormatter.error(
            code="sso_bad_callback",
            message="authorization code or state missing",
            status_code=400,
        )

    raw_tx = request.cookies.get(s.oidc_tx_cookie_name, "")
    if not raw_tx:
        # cookie lost/expired — restart cleanly rather than erroring at the user
        return RedirectResponse(p.login_path, status_code=302)

    try:
        tx = verify_tx_token(raw_tx, p.id)
        if state != tx.get("state"):
            raise OIDCError("state mismatch (CSRF?)")
        tokens = await exchange_code(p, code, tx.get("cv", ""))
        claims = await identity_claims(p, tokens, tx.get("nonce", ""))
        user = upsert_provider_user(p, claims)
    except OIDCError as e:
        logger.error(
            "SSO callback failed", provider=provider_id, error=str(e), severity="high"
        )
        return ResponseFormatter.error(
            code="sso_login_failed", message=str(e), status_code=401
        )

    if not s.auth_jwt_secret:
        return ResponseFormatter.error(
            code="auth_misconfigured",
            message="AUTH_JWT_SECRET is not set on the server",
            status_code=500,
        )

    access = mint_session_token(
        principal_from_user(user),
        sub=user["username"],
        secret=s.auth_jwt_secret,
        ttl_seconds=s.auth_access_ttl_seconds,
    )
    refresh = issue_refresh_token(user["username"], user.get("uuid", ""))

    logger.info(
        "SSO login complete",
        provider=provider_id,
        username=user.get("username", ""),
        uuid=user.get("uuid", ""),
    )

    response = RedirectResponse(safe_next_path(tx.get("next")), status_code=302)
    kwargs = _session_cookie_kwargs()
    response.set_cookie(s.auth_cookie_name, access, **kwargs)
    response.set_cookie(s.auth_refresh_cookie_name, refresh, **kwargs)
    response.delete_cookie(s.oidc_tx_cookie_name, domain=cookie_domain(), path="/")
    return response


async def _logout(family: str, provider_id: str, request: Request):
    """Revoke our refresh token, clear our cookies, then (oidc) hand off to
    the IdP's end_session endpoint — without that hop the user's still-live
    IdP session would silently re-authenticate them on the next request."""
    s = get_settings()
    try:
        p = _resolve(provider_id, family)
    except UnknownProvider:
        return _unknown_provider(provider_id, family)

    revoke_refresh_token(request.cookies.get(s.auth_refresh_cookie_name, ""))

    target = "/"
    if p.type == "oidc":
        target = await end_session_url(p) or p.post_logout_redirect or "/"
    else:
        target = p.post_logout_redirect or "/"
    response = RedirectResponse(target, status_code=302)
    for name in (s.auth_cookie_name, s.auth_refresh_cookie_name):
        response.set_cookie(
            key=name,
            value="",
            max_age=0,
            expires=0,
            httponly=True,
            secure=s.auth_cookie_secure,
            samesite="lax",
            domain=cookie_domain(),
            path="/",
        )
    logger.info("SSO logout", provider=provider_id, target=target)
    return response


# --- routes: /oidc/{provider}/* -----------------------------------------------


@oidc_router.get("/oidc/{provider_id}/login")
async def oidc_login(provider_id: str, request: Request, next: Optional[str] = None):
    return await _login("oidc", provider_id, next)


@oidc_router.get("/oidc/{provider_id}/callback")
async def oidc_callback(
    provider_id: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    return await _callback(
        "oidc", provider_id, request, code, state, error, error_description
    )


@oidc_router.get("/oidc/{provider_id}/logout")
async def oidc_logout(provider_id: str, request: Request):
    return await _logout("oidc", provider_id, request)


# --- routes: /oauth/{provider}/* (providers with type "oauth2") ---------------


@oidc_router.get("/oauth/{provider_id}/login")
async def oauth_login(provider_id: str, request: Request, next: Optional[str] = None):
    return await _login("oauth", provider_id, next)


@oidc_router.get("/oauth/{provider_id}/callback")
async def oauth_callback(
    provider_id: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    return await _callback(
        "oauth", provider_id, request, code, state, error, error_description
    )


@oidc_router.get("/oauth/{provider_id}/logout")
async def oauth_logout(provider_id: str, request: Request):
    return await _logout("oauth", provider_id, request)
