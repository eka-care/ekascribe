"""Account endpoints the web app's route guard requires (plan A5).

The frontend is cookie-based and only needs these three endpoints; if whoami
fails it force-logs-out. In dev-auth mode they answer from the configured
identity. A real login flow (phase 2 auth) replaces the bodies, not the routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from scribe_core.auth import Principal, get_principal

account_router = APIRouter()


@account_router.get("/connect-auth/v1/account/whoami")
async def whoami(principal: Principal = Depends(get_principal)):
    return {
        "uuid": principal.uuid,
        "primary_oid": principal.oid,
        "workspace_id": principal.b_id,
        "oid": [principal.oid],
        "is-paid": principal.is_paid,
    }


@account_router.post("/connect-auth/v1/account/refresh-token")
async def refresh_token(principal: Principal = Depends(get_principal)):
    # Dev mode: nothing to refresh; report a long-lived session.
    return {"status": "ok", "expires_in": 86400}


@account_router.post("/connect-auth/v1/account/logout")
async def logout():
    return {"status": "ok"}
