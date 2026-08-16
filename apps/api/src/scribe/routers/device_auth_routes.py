"""Device authorization flow (RFC 8628) — desktop app sign-in via the browser.

The desktop app cannot show the web login form, so it authorizes like a TV app:

    desktop  POST /connect-auth/v1/device/code     -> device_code (secret,
             kept by the desktop) + user_code (short, shown to the human)
    desktop  opens <server>/auth/activate?user_code=XXXX-XXXX in the browser
             (the desktop builds the URL from its configured server base)
    browser  user logs in with the normal cookie session, clicks Approve
             -> POST /connect-auth/v1/device/approve (cookie-authenticated)
    desktop  polls POST /connect-auth/v1/device/token with device_code
             -> authorization_pending ... then access_token + refresh_token

Security properties: the device_code never leaves the desktop and is stored
only as a SHA-256 hash; the user_code alone authorizes nothing (approving it
requires a logged-in browser session); rows are single-use and expire after
DEVICE_CODE_TTL_SECONDS. Tokens are returned in the body only — no cookies —
after which the desktop uses the existing Bearer + /connect-auth/v1/refresh
path (CookieAuthMiddleware already accepts Bearer tokens).

"""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from typing import Literal, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from scribe_core.auth import (
    JWT_PAYLOAD_HEADER,
    issue_refresh_token,
    mint_session_token,
    principal_from_user,
)
from scribe_core.db import ConditionalCheckFailed, get_table
from scribe_core.settings import get_settings

from scribe.core.custom_logger import get_logger
from scribe.core.http import ResponseFormatter

logger = get_logger(__name__)

device_auth_router = APIRouter()

DEVICE_CODE_TTL_SECONDS = 600  # 10 minutes to log in and click Approve
POLL_INTERVAL_SECONDS = 5      # advertised + enforced minimum poll spacing

# No O/0, I/1/L, or vowels (avoids accidental words); 28^8 ≈ 3.8e11 codes.
USER_CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXZ23456789"
USER_CODE_LENGTH = 8


class ApproveRequest(BaseModel):
    user_code: str
    action: Literal["approve", "deny"] = "approve"


class TokenRequest(BaseModel):
    device_code: str = Field(repr=False)


def _hash_device_code(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _generate_user_code() -> str:
    chars = "".join(secrets.choice(USER_CODE_ALPHABET) for _ in range(USER_CODE_LENGTH))
    return f"{chars[:4]}-{chars[4:]}"


def _normalize_user_code(raw: str) -> str:
    """Uppercase, strip everything but the alphabet, re-insert the dash."""
    cleaned = "".join(c for c in raw.upper() if c.isalnum())
    if len(cleaned) != USER_CODE_LENGTH:
        return ""
    return f"{cleaned[:4]}-{cleaned[4:]}"


@device_auth_router.post("/code")
def create_device_code():
    """Start a device sign-in. Unauthenticated — the desktop calls this first."""
    s = get_settings()
    table = get_table("device_auth")
    now = int(time.time())

    device_code = secrets.token_urlsafe(48)
    row = {
        "device_code_hash": _hash_device_code(device_code),
        "status": "pending",
        "username": "",
        "expires_at": now + DEVICE_CODE_TTL_SECONDS,
        "last_polled_at": 0,
        "created_at": now,
    }
    # user_code collisions are unlikely (28^8) but retry a few times anyway;
    # only codes still inside their TTL can collide meaningfully.
    for _ in range(5):
        user_code = _generate_user_code()
        clash = [
            r
            for r in table.find([("user_code", "eq", user_code)])
            if int(r.get("expires_at", 0)) > now and r.get("status") == "pending"
        ]
        if not clash:
            break
    else:  # pragma: no cover — 5 collisions in a row
        return ResponseFormatter.error(
            code="server_error",
            message="Could not allocate a sign-in code, try again",
            status_code=500,
        )
    row["user_code"] = user_code
    try:
        table.put_item(row, if_not_exists=True)
    except ConditionalCheckFailed:  # pragma: no cover — sha256 collision
        return ResponseFormatter.error(
            code="server_error", message="Try again", status_code=500
        )

    verification_uri = f"{s.self_url.rstrip('/')}/auth/activate"
    logger.info("device sign-in started", user_code=user_code)
    return ResponseFormatter.json_response(
        {
            "device_code": device_code,
            "user_code": user_code,
            "verification_uri": verification_uri,
            "verification_uri_complete": f"{verification_uri}?user_code={user_code}",
            "expires_in": DEVICE_CODE_TTL_SECONDS,
            "interval": POLL_INTERVAL_SECONDS,
        },
        200,
    )


@device_auth_router.post("/approve")
def approve_device_code(body: ApproveRequest, request: Request):
    """Approve/deny a pending code. Cookie-authenticated (NOT middleware-exempt):
    the identity comes from the verified session, never from the request body."""

    # CookieAuthMiddleware verified the session and injected the claims.
    try:
        claims = json.loads(request.headers.get(JWT_PAYLOAD_HEADER, ""))
        username = claims["sub"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return ResponseFormatter.error(
            code="unauthorized", message="No session", status_code=401
        )

    user_code = _normalize_user_code(body.user_code)
    if not user_code:
        return ResponseFormatter.error(
            code="invalid_user_code",
            message="That code doesn't look right — check the desktop app",
            status_code=400,
        )

    table = get_table("device_auth")
    now = int(time.time())
    rows = [
        r
        for r in table.find([("user_code", "eq", user_code)])
        if r.get("status") == "pending" and int(r.get("expires_at", 0)) > now
    ]
    if not rows:
        return ResponseFormatter.error(
            code="code_not_found",
            message="This code is invalid, expired, or already used — "
            "restart sign-in from the desktop app",
            status_code=404,
        )
    row = max(rows, key=lambda r: int(r.get("created_at", 0)))

    new_status = "approved" if body.action == "approve" else "denied"
    table.update_item(
        {"device_code_hash": row["device_code_hash"]},
        {"status": new_status, "username": username if body.action == "approve" else ""},
    )
    logger.info("device sign-in %s" % new_status, user_code=user_code, username=username)
    return ResponseFormatter.json_response({"status": "success", "result": new_status}, 200)


@device_auth_router.post("/token")
def poll_device_token(body: TokenRequest):
    """Poll for tokens. Unauthenticated — the device_code IS the credential."""
    s = get_settings()
    table = get_table("device_auth")
    now = int(time.time())

    row = table.get_item({"device_code_hash": _hash_device_code(body.device_code)})
    if not row:
        return ResponseFormatter.error(
            code="invalid_device_code", message="Unknown device code", status_code=400
        )

    if int(row.get("expires_at", 0)) <= now or row.get("status") == "consumed":
        return ResponseFormatter.error(
            code="expired_token",
            message="Sign-in expired — start again from the desktop app",
            status_code=400,
        )

    # enforce the advertised poll interval (RFC 8628 slow_down)
    if now - int(row.get("last_polled_at", 0)) < POLL_INTERVAL_SECONDS:
        return ResponseFormatter.error(
            code="slow_down", message="Polling too fast", status_code=400
        )
    table.update_item({"device_code_hash": row["device_code_hash"]}, {"last_polled_at": now})

    status = row.get("status")
    if status == "pending":
        return ResponseFormatter.error(
            code="authorization_pending",
            message="Waiting for the user to approve in the browser",
            status_code=400,
        )
    if status == "denied":
        table.update_item(
            {"device_code_hash": row["device_code_hash"]}, {"status": "consumed"}
        )
        return ResponseFormatter.error(
            code="access_denied", message="The request was denied", status_code=400
        )

    # approved — single use: consume BEFORE minting so a raced second poll loses.
    table.update_item({"device_code_hash": row["device_code_hash"]}, {"status": "consumed"})

    user = get_table("users").get_item({"username": row.get("username", "")}) or {}
    if not user or not user.get("is_active", True):
        return ResponseFormatter.error(
            code="access_denied", message="Account unavailable", status_code=400
        )

    access = mint_session_token(
        principal_from_user(user),
        sub=user["username"],
        secret=s.auth_jwt_secret or "",
        ttl_seconds=s.auth_access_ttl_seconds,
    )
    refresh = issue_refresh_token(user["username"], user.get("uuid", ""))
    logger.info("device sign-in tokens issued", username=user["username"])
    return ResponseFormatter.json_response(
        {
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
            "refresh_token": refresh,
            "refresh_expires_in": s.auth_refresh_ttl_seconds,
        },
        200,
    )
