"""Auth for the on-prem stack (A5: reproduce the `jwt-payload` header contract).

voice2rx-be has no auth code — AWS API Gateway used to inject a pre-verified
``jwt-payload`` JSON header. On-prem, ``DevAuthMiddleware`` constructs that header
from settings on every request (decision #17: dev-token only for v1), so all forked
handlers keep working unchanged. ``Principal`` is the ONE typed dependency that
replaces the three inconsistent header-parsing paths during the port.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

from scribe_core.settings import get_settings

JWT_PAYLOAD_HEADER = "jwt-payload"


@dataclass(frozen=True)
class Principal:
    """Typed view of the claims the codebase actually consumes (see plan A5)."""

    b_id: str
    uuid: str
    oid: str
    client_id: str | None
    is_paid: bool
    issuer: str

    @classmethod
    def from_jwt_payload(cls, payload: dict) -> "Principal":
        cc = payload.get("cc") or {}
        return cls(
            b_id=payload.get("b-id", ""),
            uuid=payload.get("uuid", ""),
            oid=payload.get("oid", ""),
            client_id=payload.get("c-id"),
            is_paid=cc.get("esc") == 1,
            issuer=payload.get("iss", ""),
        )

    def to_jwt_payload(self) -> dict:
        payload = {
            "b-id": self.b_id,
            "uuid": self.uuid,
            "oid": self.oid,
            "iss": self.issuer,
            "cc": {"esc": 1 if self.is_paid else 0},
        }
        if self.client_id:
            payload["c-id"] = self.client_id
        return payload


def dev_principal() -> Principal:
    s = get_settings()
    return Principal(
        b_id=s.dev_b_id,
        uuid=s.dev_uuid,
        oid=s.dev_oid,
        client_id=s.dev_client_id,
        is_paid=True,  # cc.esc == 1 → skip transaction limits
        issuer=s.auth_issuer,
    )


class DevAuthMiddleware(BaseHTTPMiddleware):
    """Injects the ``jwt-payload`` header the forked handlers expect.
    If ``DEV_AUTH_TOKEN`` is set, requests must present it as a Bearer token
    (except on the exempt paths below); if unset, every request is authenticated
    as the configured dev identity — suitable only for single-box pilots.
    """

    EXEMPT_PREFIXES = (
        "/voice/ping",
        # discovery MUST be publicly accessible (alliance SDK validates against it)
        "/.well-known",
        "/voice/v1/.well-known",
        "/docs",
        "/openapi.json",
        "/healthz",
        # blob endpoints authenticate with their own HMAC URL tokens
        # (the alliance SDK sends storage requests with attachAuth: false)
        "/voice/v1/blob",
    )

    # everything the API owns lives under these prefixes; any other path is a
    # static web-UI asset (HTML shells, JS chunks — no data) and needs no token.
    API_PREFIXES = ("/voice", "/connect-auth")
    async def dispatch(self, request: Request, call_next):
        s = get_settings()
        path = request.url.path
        exempt = path.startswith(self.EXEMPT_PREFIXES) or not path.startswith(
            self.API_PREFIXES
        )

        if s.dev_auth_token and not exempt:
            auth = request.headers.get("authorization", "")
            token = auth.removeprefix("Bearer ").strip()
            # Tokenized upload/download URLs use ?token= because the alliance SDK
            # sends storage requests with attachAuth: false (plan A4).
            if not token:
                token = request.query_params.get("token", "")
            if token != s.dev_auth_token:
                from starlette.responses import JSONResponse

                return JSONResponse({"detail": "unauthorized"}, status_code=401)

        # inject the pre-verified jwt-payload header (replaces API Gateway).
        # a caller-supplied jwt-payload is respected — dev mode trusts the
        # header (tests and multi-identity dev flows rely on this; production
        # auth replaces this middleware entirely).
        if not request.headers.get(JWT_PAYLOAD_HEADER):
            payload = json.dumps(dev_principal().to_jwt_payload())
            headers = request.headers.mutablecopy()
            headers[JWT_PAYLOAD_HEADER] = payload
            request.scope["headers"] = headers.raw

        return await call_next(request)


def get_principal(request: Request) -> Principal:
    """FastAPI dependency — the single replacement for all header-parsing paths."""
    raw = request.headers.get(JWT_PAYLOAD_HEADER)
    if not raw:
        raise HTTPException(status_code=401, detail="missing identity")
    try:
        return Principal.from_jwt_payload(json.loads(raw))
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="invalid identity") from exc


# --- Session auth (AUTH_MODE=jwt): cookie/Bearer JWT --------------------------
SESSION_ALGO = "HS256"
def mint_session_token(principal: Principal, sub: str, secret: str, ttl_seconds: int) -> str:
    """Sign the app's identity claims (b-id/uuid/oid/...) into a session JWT."""
    import time
    import jwt

    payload = principal.to_jwt_payload()
    now = int(time.time())
    payload.update({"sub": sub, "iat": now, "exp": now + int(ttl_seconds)})
    return jwt.encode(payload, secret, algorithm=SESSION_ALGO)


def verify_session_token(token: str, secret: str) -> dict:
    """Decode + verify signature and expiry. Raises jwt.PyJWTError on failure."""
    import jwt
    return jwt.decode(token, secret, algorithms=[SESSION_ALGO])


ROTATION_GRACE_SECONDS = 60


def cookie_domain() -> str | None:
    """AUTH_COOKIE_DOMAIN, sanitized. Values containing whitespace or '#'
    (a pasted inline comment) would crash Set-Cookie header encoding — treat
    them as unset instead of taking logins down."""
    raw = (get_settings().auth_cookie_domain or "").strip()
    if not raw or any(c in raw for c in ' \t#\u2014'):
        return None
    return raw


def principal_from_user(user: dict) -> Principal:
    s = get_settings()
    return Principal(
        b_id=user.get("b_id") or s.dev_b_id,
        uuid=user.get("uuid", ""),
        oid=user.get("oid", ""),
        client_id=s.dev_client_id,
        is_paid=True,
        issuer=s.auth_issuer,
    )


def _hash_refresh(raw: str) -> str:
    import hashlib

    return hashlib.sha256(raw.encode()).hexdigest()


def issue_refresh_token(username: str, user_uuid: str) -> str:
    """Create + persist an opaque refresh token; returns the raw value."""
    import secrets
    import time

    from scribe_core.db import get_table

    s = get_settings()
    raw = secrets.token_urlsafe(48)
    now = int(time.time())
    get_table("refresh_tokens").put_item(
        {
            "token_hash": _hash_refresh(raw),
            "username": username,
            "uuid": user_uuid,
            "expires_at": now + s.auth_refresh_ttl_seconds,
            "revoked": 0,
            "rotated_at": 0,
            "created_at": now,
        }
    )
    return raw


def revoke_refresh_token(raw: str) -> None:
    import time

    from scribe_core.db import get_table

    if not raw:
        return
    try:
        get_table("refresh_tokens").update_item(
            {"token_hash": _hash_refresh(raw)},
            {"revoked": 1, "rotated_at": int(time.time())},
            require_exists=False,
        )
    except Exception:
        pass


def revoke_all_refresh_tokens(username: str) -> None:
    import time

    from scribe_core.db import get_table

    table = get_table("refresh_tokens")
    for row in table.find({"username": username}):
        table.update_item(
            {"token_hash": row["token_hash"]},
            {"revoked": 1, "rotated_at": int(time.time())},
            require_exists=False,
        )


def consume_refresh_token(raw: str, rotate: bool = True):
    """Validate a refresh token; returns (user, new_raw_refresh | None) or None.

    - valid + rotate       -> old revoked (60s grace), new token issued
    - valid within grace   -> accepted WITHOUT re-rotation (parallel requests
                              keep their cookie; only the access token renews)
    - revoked beyond grace -> REUSE detected: every session for the user is
                              revoked; returns None
    - expired / unknown    -> None
    """
    import time
    from scribe_core.db import get_table

    if not raw:
        return None
    table = get_table("refresh_tokens")
    row = table.get_item({"token_hash": _hash_refresh(raw)})
    if not row:
        return None
    now = int(time.time())
    if int(row.get("expires_at", 0)) <= now:
        return None
    in_grace = (
        int(row.get("revoked", 0)) == 1
        and int(row.get("rotated_at", 0)) > 0
        and now - int(row.get("rotated_at", 0)) <= ROTATION_GRACE_SECONDS
    )
    if int(row.get("revoked", 0)) == 1 and not in_grace:
        revoke_all_refresh_tokens(row.get("username", ""))
        return None

    user = get_table("users").get_item({"username": row.get("username", "")}) or {}
    if not user or not user.get("is_active", True):
        return None

    if in_grace or not rotate:
        return user, None
    table.update_item(
        {"token_hash": row["token_hash"]},
        {"revoked": 1, "rotated_at": now},
        require_exists=False,
    )
    return user, issue_refresh_token(user["username"], user.get("uuid", ""))


class CookieAuthMiddleware(BaseHTTPMiddleware):
    """Production auth (AUTH_MODE=jwt): replaces DevAuthMiddleware.

    Verifies the session JWT from the auth cookie (or an ``Authorization:
    Bearer`` header for programmatic clients), then injects the verified
    claims as the ``jwt-payload`` header — the exact contract every handler
    already consumes, so the rest of the app is untouched. Any caller-supplied
    ``jwt-payload`` header is stripped first (it is an internal, post-auth
    header — trusting it would be an auth bypass).
    """

    EXEMPT_PREFIXES = DevAuthMiddleware.EXEMPT_PREFIXES + (
        "/connect-auth/v1/auth-mode",
        "/connect-auth/v1/login",
        "/connect-auth/v1/signup",
        "/connect-auth/v1/logout",
        "/connect-auth/v1/refresh",
        "/connect-auth/v1/account/logout",
        "/connect-auth/v1/account/refresh-token",
    )
    API_PREFIXES = DevAuthMiddleware.API_PREFIXES
    async def dispatch(self, request: Request, call_next):
        # never trust an externally supplied identity header
        if request.headers.get(JWT_PAYLOAD_HEADER):
            headers = request.headers.mutablecopy()
            del headers[JWT_PAYLOAD_HEADER]
            request.scope["headers"] = headers.raw

        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if path.startswith(self.EXEMPT_PREFIXES) or not path.startswith(self.API_PREFIXES):
            return await call_next(request)

        s = get_settings()
        bearer = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        cookie_token = request.cookies.get(s.auth_cookie_name, "")
        token = bearer or cookie_token or request.query_params.get("token", "")
        source = "bearer" if bearer else ("cookie" if cookie_token else "query")

        import jwt as pyjwt
        from starlette.responses import JSONResponse

        if not token:
            recovered = await self._on_browser_auth_failure(request, call_next)
            if recovered is not None:
                return recovered
            return JSONResponse({"detail": "missing_token"}, status_code=403)

        try:
            claims = verify_session_token(token, s.auth_jwt_secret or "")
        except pyjwt.ExpiredSignatureError:
            if source == "cookie": 
                # browser path: transparently refresh, keep the app working
                result = consume_refresh_token(
                    request.cookies.get(s.auth_refresh_cookie_name, "")
                )
                if result:
                    user, new_refresh = result
                    principal = principal_from_user(user)
                    new_access = mint_session_token(
                        principal,
                        sub=user["username"],
                        secret=s.auth_jwt_secret or "",
                        ttl_seconds=s.auth_access_ttl_seconds,
                    )
                    claims = verify_session_token(new_access, s.auth_jwt_secret or "")
                    headers = request.headers.mutablecopy()
                    headers[JWT_PAYLOAD_HEADER] = json.dumps(claims)
                    request.scope["headers"] = headers.raw
                    response = await call_next(request)
                    cookie_kwargs = dict(
                        max_age=s.auth_refresh_ttl_seconds,
                        httponly=True,
                        secure=s.auth_cookie_secure,
                        samesite="lax",
                        domain=cookie_domain(),
                        path="/",
                    )
                    response.set_cookie(s.auth_cookie_name, new_access, **cookie_kwargs)
                    if new_refresh:
                        response.set_cookie(
                            s.auth_refresh_cookie_name, new_refresh, **cookie_kwargs
                        )
                    return response
            if source == "cookie":
                recovered = await self._on_browser_auth_failure(request, call_next)
                if recovered is not None:
                    return recovered
                # browser with a dead refresh token: nothing can cure this
                # request -> 403: redirect to login
                return JSONResponse({"detail": "session_expired"}, status_code=403)
            # bearer/native path: 401 -> client calls /refresh and retries
            return JSONResponse({"detail": "token_expired"}, status_code=401)
        except pyjwt.PyJWTError:
            if source == "cookie":
                recovered = await self._on_browser_auth_failure(request, call_next)
                if recovered is not None:
                    return recovered
            # bad signature / malformed -> hard logout signal
            return JSONResponse({"detail": "invalid_token"}, status_code=403)

        headers = request.headers.mutablecopy()
        headers[JWT_PAYLOAD_HEADER] = json.dumps(claims)
        request.scope["headers"] = headers.raw
        return await call_next(request)

    async def _on_browser_auth_failure(self, request: Request, call_next):
        """Hook: SSO mode recovers the session from the platform token here.
        None = fall through to the normal 403."""
        return None


# --- SSO (AUTH_MODE=sso): trusted platform-cookie exchange ---------------------


async def exchange_sso_token(raw_token: str):
    """Validate the platform's token against its userinfo API and upsert the
    user. Returns the users-table row, or None if the token is no good.

    Mapping: platform ``id`` -> uuid (stable across exchanges), ``email`` ->
    username + oid, ``name`` -> display_name, b_id = the deployment workspace.
    SSO rows carry NO password hash — password login for them fails closed."""
    import time

    from scribe_core.db import ConditionalCheckFailed, get_table

    s = get_settings()
    if not raw_token or not s.sso_userinfo_url:
        return None

    import httpx

    try:
        async with httpx.AsyncClient(
            timeout=s.sso_request_timeout_s, verify=s.sso_verify_ssl
        ) as client:
            resp = await client.get(
                s.sso_userinfo_url,
                headers={
                    "Authorization": f"Bearer {raw_token}",
                    "Cookie": f"{s.sso_token_cookie}={raw_token}",
                },
            )
    except Exception as exc:  # noqa: BLE001 — network failure = not authenticated
        import logging

        logging.getLogger(__name__).warning("SSO userinfo call failed: %s", exc)
        return None
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except Exception:
        return None

    email = (data.get("email") or "").strip().lower()
    platform_id = str(data.get("id") or "").strip()
    if not email or not platform_id:
        return None

    users = get_table("users")
    row = users.get_item({"username": email})
    if row:
        return row
    user = {
        "username": email,
        "display_name": (data.get("name") or email).strip(),
        "uuid": platform_id,
        "oid": email,
        "b_id": s.dev_b_id,
        "is_active": True,
        "sso": True,
        "created_at": int(time.time()),
    }
    try:
        users.put_item(user, if_not_exists=True)
    except ConditionalCheckFailed:
        return users.get_item({"username": email})
    return user


class SSOAuthMiddleware(CookieAuthMiddleware):
    """AUTH_MODE=sso: CookieAuthMiddleware plus silent session bootstrap.

    When our session is missing / expired-beyond-refresh / invalid but the
    platform's token cookie is present, exchange it on the spot: the request
    proceeds and the response carries fresh session+refresh cookies. Without a
    platform token, browser navigations 302 to SSO_LOGIN_REDIRECT_URL and API
    calls get 403 sso_login_required carrying the login_url."""

    async def _on_browser_auth_failure(self, request: Request, call_next):
        from starlette.responses import JSONResponse, RedirectResponse

        s = get_settings()
        raw = request.cookies.get(s.sso_token_cookie, "")
        user = await exchange_sso_token(raw) if raw else None
        if user:
            principal = principal_from_user(user)
            access = mint_session_token(
                principal,
                sub=user["username"],
                secret=s.auth_jwt_secret or "",
                ttl_seconds=s.auth_access_ttl_seconds,
            )
            claims = verify_session_token(access, s.auth_jwt_secret or "")
            new_refresh = issue_refresh_token(user["username"], user.get("uuid", ""))
            headers = request.headers.mutablecopy()
            headers[JWT_PAYLOAD_HEADER] = json.dumps(claims)
            request.scope["headers"] = headers.raw
            response = await call_next(request)
            cookie_kwargs = dict(
                max_age=s.auth_refresh_ttl_seconds,
                httponly=True,
                secure=s.auth_cookie_secure,
                samesite="lax",
                domain=cookie_domain(),
                path="/",
            )
            response.set_cookie(s.auth_cookie_name, access, **cookie_kwargs)
            response.set_cookie(
                s.auth_refresh_cookie_name, new_refresh, **cookie_kwargs
            )
            return response

        # No usable platform token: send the user to the platform login.
        accepts_html = "text/html" in (request.headers.get("accept") or "")
        if request.method == "GET" and accepts_html:
            return RedirectResponse(s.sso_login_redirect_url, status_code=302)
        return JSONResponse(
            {"detail": "sso_login_required", "login_url": s.sso_login_redirect_url},
            status_code=403,
        )
