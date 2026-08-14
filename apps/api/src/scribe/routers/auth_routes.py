"""Username/password session auth (AUTH_MODE=jwt).

POST /connect-auth/v1/signup  — create a user (guarded by AUTH_ALLOW_SIGNUP)
POST /connect-auth/v1/login   — verify password, set the session cookie
POST /connect-auth/v1/logout  — clear the session cookie

The session JWT carries the app's existing identity claims (b-id/uuid/oid/…),
so once CookieAuthMiddleware injects them as ``jwt-payload`` every downstream
flow works unchanged. All users share the deployment workspace (b_id from
settings); uuid/oid are unique per user.
"""

from __future__ import annotations

import re
import time
import uuid as uuidlib
from typing import Optional

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from scribe_core.auth import (
    consume_refresh_token,
    cookie_domain,
    issue_refresh_token,
    mint_session_token,
    principal_from_user,
    revoke_refresh_token,
)
from scribe_core.db import ConditionalCheckFailed, get_table
from scribe_core.settings import get_settings

from scribe.core.custom_logger import get_logger
from scribe.core.http import ResponseFormatter

logger = get_logger(__name__)

auth_router = APIRouter()

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._@+-]{3,64}$")  # emails welcome
MIN_PASSWORD_LEN = 8


class SignupRequest(BaseModel):
    username: str
    password: str = Field(repr=False)
    display_name: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str = Field(repr=False)


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None


def _hasher():
    from argon2 import PasswordHasher

    return PasswordHasher()


def _cookie_kwargs() -> dict:
    s = get_settings()
    # both cookies persist for the REFRESH lifetime: the short access expiry
    # lives inside the JWT, so the middleware still receives the expired token
    # and can auto-refresh it (see auth design doc).
    return dict(
        max_age=s.auth_refresh_ttl_seconds,
        httponly=True,
        secure=s.auth_cookie_secure,
        samesite="lax",
        domain=cookie_domain(),
        path="/",
    )


def _session_response(user: dict, refresh_raw: Optional[str]) -> Response:
    """Mint the access JWT, set both cookies, and return tokens in the body
    (browsers use the cookies; native apps read the body)."""
    s = get_settings()
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
    body = {
        "status": "success",
        "user": {
            "username": user["username"],
            "display_name": user.get("display_name") or user["username"],
            "uuid": user.get("uuid", ""),
            "oid": user.get("oid", ""),
            "b_id": user.get("b_id", ""),
        },
        "access_token": access,
        "expires_in": s.auth_access_ttl_seconds,
    }
    if refresh_raw:
        body["refresh_token"] = refresh_raw
        body["refresh_expires_in"] = s.auth_refresh_ttl_seconds
    response = ResponseFormatter.json_response(body, 200)
    kwargs = _cookie_kwargs()
    response.set_cookie(key=s.auth_cookie_name, value=access, **kwargs)
    if refresh_raw:
        response.set_cookie(
            key=s.auth_refresh_cookie_name, value=refresh_raw, **kwargs
        )
    return response


def _login_response(user: dict) -> Response:
    refresh_raw = issue_refresh_token(user["username"], user.get("uuid", ""))
    return _session_response(user, refresh_raw)


@auth_router.get("/auth-mode")
def auth_mode():
    """Public: how this deployment authenticates — the login page adapts."""
    s = get_settings()
    oidc_enabled = bool(
        (s.oidc_issuer or s.oidc_discovery_url) and s.oidc_client_id
    )
    return ResponseFormatter.json_response(
        {
            "mode": s.auth_mode,
            "allow_password_login": s.auth_allow_password_login,
            # OIDC as an additional login button (works in any auth_mode —
            # the /oidc/* routes are always mounted)
            "oidc_enabled": oidc_enabled,
            "oidc_login_url": "/connect-auth/v1/oidc/login" if oidc_enabled else None,
            "oidc_display_name": s.oidc_display_name,
            "allow_signup": s.auth_allow_signup and s.auth_allow_password_login,
            "login_url": (
                "/connect-auth/v1/oidc/login"
                if s.auth_mode == "oidc"
                else s.sso_login_redirect_url
                if s.auth_mode == "sso"
                else "/auth/login"
            ),
            # oidc: log out at the IdP too, else its live session silently
            # re-authenticates the user on the next request
            "logout_url": (
                "/connect-auth/v1/oidc/logout" if s.auth_mode == "oidc" else None
            ),
        },
        200,
    )


def _password_flow_disabled():
    s = get_settings()
    if s.auth_allow_password_login:
        return None
    return ResponseFormatter.error(
        code="password_login_disabled",
        message="Username/password login is disabled on this deployment",
        status_code=403,
    )


@auth_router.post("/signup")
def signup(body: SignupRequest):
    s = get_settings()
    disabled = _password_flow_disabled()
    if disabled is not None:
        return disabled
    if not s.auth_allow_signup:
        return ResponseFormatter.error(
            code="signup_disabled",
            message="Signup is disabled on this deployment",
            status_code=403,
        )
    username = body.username.strip().lower()
    if not USERNAME_RE.match(username):
        return ResponseFormatter.error(
            code="invalid_username",
            message="Username must be 3-64 chars: letters, digits, or . _ - @ +",
            status_code=400,
        )
    if len(body.password) < MIN_PASSWORD_LEN:
        return ResponseFormatter.error(
            code="weak_password",
            message=f"Password must be at least {MIN_PASSWORD_LEN} characters",
            status_code=400,
        )

    user = {
        "username": username,
        "password_hash": _hasher().hash(body.password),
        "display_name": (body.display_name or username).strip(),
        "uuid": str(uuidlib.uuid4()),
        "oid": f"oid-{uuidlib.uuid4().hex[:20]}",
        "b_id": s.dev_b_id,  # shared deployment workspace
        "is_active": True,
        "created_at": int(time.time()),
    }
    try:
        get_table("users").put_item(user, if_not_exists=True)
    except ConditionalCheckFailed:
        return ResponseFormatter.error(
            code="username_taken",
            message="This username is already registered",
            status_code=409,
        )
    logger.info("user created", username=username, uuid=user["uuid"])
    return _login_response(user)


@auth_router.post("/login")
def login(body: LoginRequest):
    from argon2.exceptions import VerifyMismatchError

    disabled = _password_flow_disabled()
    if disabled is not None:
        return disabled

    username = body.username.strip().lower()
    user = get_table("users").get_item({"username": username}) or {}
    stored_hash = user.get("password_hash", "")
    try:
        if not stored_hash:
            # constant-shape work to blunt username enumeration timing
            _hasher().hash(body.password)
            raise VerifyMismatchError
        _hasher().verify(stored_hash, body.password)
    except Exception:
        return ResponseFormatter.error(
            code="invalid_credentials",
            message="Invalid username or password",
            status_code=401,
        )
    if not user.get("is_active", True):
        return ResponseFormatter.error(
            code="account_disabled",
            message="This account is disabled",
            status_code=403,
        )
    logger.info("user logged in", username=username)
    return _login_response(user)


@auth_router.post("/refresh")
@auth_router.post("/account/refresh-token")  # legacy FE path
def refresh(body: Optional[RefreshRequest] = None, request: Request = None):
    """Explicit refresh for native apps (and browsers, though the middleware
    normally auto-refreshes). Rotates the refresh token."""
    s = get_settings()
    raw = (body.refresh_token if body else None) or (
        request.cookies.get(s.auth_refresh_cookie_name, "") if request else ""
    )
    result = consume_refresh_token(raw)
    if not result:
        return ResponseFormatter.error(
            code="invalid_refresh_token",
            message="Refresh token is invalid, expired, or revoked — log in again",
            status_code=401,
        )
    user, new_refresh = result
    logger.info("session refreshed", username=user.get("username", ""))
    # grace-window hit returns no rotation; keep the client's current token
    return _session_response(user, new_refresh or raw)


@auth_router.post("/logout")
@auth_router.post("/account/logout")  # legacy FE path
def logout(body: Optional[RefreshRequest] = None, request: Request = None):
    s = get_settings()
    raw = (body.refresh_token if body else None) or (
        request.cookies.get(s.auth_refresh_cookie_name, "") if request else ""
    )
    revoke_refresh_token(raw)
    response = ResponseFormatter.json_response({"status": "success"}, 200)
    # expire with the SAME attributes the cookies were set with — browsers only
    # remove a cookie when name+domain+path (and secure context) all match
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
    return response
