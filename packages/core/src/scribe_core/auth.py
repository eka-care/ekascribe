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

    async def dispatch(self, request: Request, call_next):
        s = get_settings()
        path = request.url.path
        exempt = path.startswith(self.EXEMPT_PREFIXES)

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

        # Inject the pre-verified jwt-payload header (replaces API Gateway).
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
