"""OIDC login endpoints (AUTH_MODE=oidc).

GET /connect-auth/v1/oidc/login     -> 302 to the IdP (state+nonce+PKCE in a
                                       signed, short-lived cookie)
GET /connect-auth/v1/oidc/callback  -> validate, provision, drop our session
                                       cookies, 302 back into the app

Both are exempt from the auth middleware; everything after the callback runs
on the ordinary vaarta session.
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
    safe_next_path,
    upsert_oidc_user,
    validate_id_token,
)
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


@oidc_router.get("/oidc/login")
async def oidc_login(request: Request, next: Optional[str] = None):
    """Start the authorization-code flow."""
    s = get_settings()
    try:
        url, tx_token = await authorization_redirect_url(safe_next_path(next))
    except OIDCError as e:
        logger.error("OIDC login could not start", error=str(e), severity="high")
        return ResponseFormatter.error(
            code="oidc_misconfigured", message=str(e), status_code=500
        )
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(s.oidc_tx_cookie_name, tx_token, **_tx_cookie_kwargs())
    return response


@oidc_router.get("/oidc/callback")
async def oidc_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    """Finish the flow: validate, provision, and drop our session cookies."""
    from scribe_core.oidc import verify_tx_token
    s = get_settings()
    if error:
        logger.warning("IdP returned an error", error=error, detail=error_description)
        return ResponseFormatter.error(
            code="oidc_error",
            message=error_description or error,
            status_code=401,
        )
    if not code or not state:
        return ResponseFormatter.error(
            code="oidc_bad_callback",
            message="authorization code or state missing",
            status_code=400,
        )

    raw_tx = request.cookies.get(s.oidc_tx_cookie_name, "")
    if not raw_tx:
        # cookie lost/expired — restart cleanly rather than erroring at the user
        return RedirectResponse("/connect-auth/v1/oidc/login", status_code=302)

    try:
        tx = verify_tx_token(raw_tx)
        if state != tx.get("state"):
            raise OIDCError("state mismatch (CSRF?)")
        tokens = await exchange_code(code, tx.get("cv", ""))
        id_token = tokens.get("id_token")
        if not id_token:
            raise OIDCError("token response has no id_token")
        claims = await validate_id_token(id_token, tx.get("nonce", ""))
        user = upsert_oidc_user(claims)
    except OIDCError as e:
        logger.error("OIDC callback failed", error=str(e), severity="high")
        return ResponseFormatter.error(
            code="oidc_login_failed", message=str(e), status_code=401
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
        "OIDC login complete",
        username=user.get("username", ""),
        uuid=user.get("uuid", ""),
    )

    response = RedirectResponse(safe_next_path(tx.get("next")), status_code=302)
    kwargs = _session_cookie_kwargs()
    response.set_cookie(s.auth_cookie_name, access, **kwargs)
    response.set_cookie(s.auth_refresh_cookie_name, refresh, **kwargs)
    response.delete_cookie(
        s.oidc_tx_cookie_name, domain=cookie_domain(), path="/"
    )
    return response


@oidc_router.get("/oidc/logout")
async def oidc_logout(request: Request):
    """Single-hop RP-initiated logout: revoke our refresh, clear our cookies,
    then hand off to the IdP's end_session endpoint.

    Without the IdP hop the user's still-live IdP session would silently
    re-authenticate them on the very next request.
    """
    s = get_settings()
    revoke_refresh_token(request.cookies.get(s.auth_refresh_cookie_name, ""))

    target = await end_session_url() or s.oidc_post_logout_redirect or "/"
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
    logger.info("OIDC logout -> IdP end_session")
    return response
