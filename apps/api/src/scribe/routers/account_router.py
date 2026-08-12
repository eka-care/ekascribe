"""Account endpoints the web app's route guard requires (plan A5).

The frontend is cookie-based and only needs these three endpoints; if whoami
fails it force-logs-out. In dev-auth mode they answer from the configured
identity. A real login flow (phase 2 auth) replaces the bodies, not the routes.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request

from scribe_core.auth import JWT_PAYLOAD_HEADER, Principal, get_principal

account_router = APIRouter()


@account_router.get("/connect-auth/v1/account/whoami")
async def whoami(request: Request, principal: Principal = Depends(get_principal)):
    # ``sub`` (username) rides in the verified claims but not in Principal;
    # surfaced here so UI screens (e.g. the device-approve page) can show
    # who is signed in. Empty string in dev mode (no sub claim).
    try:
        sub = json.loads(request.headers.get(JWT_PAYLOAD_HEADER, "")).get("sub", "")
    except (json.JSONDecodeError, TypeError):
        sub = ""
    return {
        "uuid": principal.uuid,
        "primary_oid": principal.oid,
        "workspace_id": principal.b_id,
        "oid": [principal.oid],
        "is-paid": principal.is_paid,
        "username": sub,
    }


# NOTE: /account/logout and /account/refresh-token are handled by
# scribe.routers.auth_routes (real session auth: cookie clearing + refresh
# rotation/revocation). The dev-mode stubs that used to live here shadowed
# those handlers — logout returned 200 without clearing anything.
