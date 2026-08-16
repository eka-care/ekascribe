#!/usr/bin/env python3
"""Mock Parichay — a fake OAuth2 provider for end-to-end login testing.

Lets you exercise the ENTIRE SSO pipeline (authorize redirect, callback,
PKCE-checked token exchange, userinfo, claim mapping, user provisioning,
session cookies) before NIC registers the real Parichay service.

Run it on the host (not in docker):

    uv run python scripts/mock_idp.py            # listens on :9999

Then add this provider to .env (single line) and `make start`:

    AUTH_PROVIDERS=[{"id":"mockichay","type":"oauth2","display_name":"Mock Parichay","authorization_endpoint":"http://localhost:9999/oauth2/authorize","token_endpoint":"http://host.docker.internal:9999/oauth2/token","userinfo_endpoint":"http://host.docker.internal:9999/api/user","client_id":"mock-client","client_secret":"mock-secret","scopes":"user_details","claim_uuid":"userId","claim_username":"email","claim_name":"fullName"}]

Why two hostnames: the BROWSER visits the authorization_endpoint (so it is
localhost), but the API CONTAINER calls the token/userinfo endpoints (so they
are host.docker.internal — docker's name for the host machine). If you run
the api outside docker, use localhost for all three.

The mock mimics Parichay's behaviour faithfully where it matters:
- authorize validates client_id + redirect_uri and echoes state
- token enforces client_secret_post AND the S256 PKCE check
- userinfo requires the Bearer token and answers Parichay-style field names
  (userId / email / fullName) — the same shape the claim mapping expects
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

PORT = 9999
CLIENT_ID = "mock-client"
CLIENT_SECRET = "mock-secret"
ALLOWED_REDIRECT_PREFIXES = ("http://localhost", "http://127.0.0.1")
CODE_TTL_SECONDS = 300

TEST_USER = {
    "userId": "MOCK-DOCTOR-001",
    "email": "test.doctor@mock.gov.in",
    "fullName": "Dr Test Doctor",
}

app = FastAPI(title="mock parichay")
_codes: dict = {}   # code -> {challenge, redirect_uri, expires}
_tokens: set = set()


@app.get("/oauth2/authorize")
def authorize(
    response_type: str = "",
    client_id: str = "",
    redirect_uri: str = "",
    state: str = "",
    code_challenge: str = "",
    code_challenge_method: str = "",
    scope: str = "",
):
    if response_type != "code" or client_id != CLIENT_ID:
        return HTMLResponse(
            "<h2>The requested service name is invalid or the service is "
            "not yet registered!</h2>(mock: wrong client_id)", status_code=400
        )
    if not redirect_uri.startswith(ALLOWED_REDIRECT_PREFIXES):
        return HTMLResponse(
            f"<h2>redirect_uri not registered:</h2><code>{redirect_uri}</code>",
            status_code=400,
        )
    code = secrets.token_urlsafe(24)
    _codes[code] = {
        "challenge": code_challenge,
        "redirect_uri": redirect_uri,
        "expires": time.time() + CODE_TTL_SECONDS,
    }
    sep = "&" if "?" in redirect_uri else "?"
    print(f"[mock] authorize ok -> issuing code, redirecting back (state={state[:12]}…)")
    return RedirectResponse(
        f"{redirect_uri}{sep}code={code}&state={state}", status_code=302
    )


@app.post("/oauth2/token")
async def token(request: Request):
    form = dict((await request.form()).items())
    print(f"[mock] token request: {sorted(form.keys())}")
    if form.get("client_id") != CLIENT_ID or form.get("client_secret") != CLIENT_SECRET:
        return JSONResponse({"error": "invalid_client"}, status_code=401)
    entry = _codes.pop(form.get("code", ""), None)
    if not entry or entry["expires"] < time.time():
        return JSONResponse({"error": "invalid_grant",
                             "error_description": "unknown or expired code"}, 400)
    # PKCE: S256(code_verifier) must equal the challenge from /authorize
    digest = hashlib.sha256(form.get("code_verifier", "").encode()).digest()
    derived = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    if derived != entry["challenge"]:
        return JSONResponse({"error": "invalid_grant",
                             "error_description": "PKCE verification failed"}, 400)
    access = secrets.token_urlsafe(32)
    _tokens.add(access)
    print("[mock] token exchange ok (PKCE verified)")
    return {"access_token": access, "token_type": "Bearer", "expires_in": 3600}


@app.get("/api/user")
def userinfo(request: Request):
    bearer = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if bearer not in _tokens:
        return JSONResponse({"error": "invalid_token"}, status_code=401)
    print(f"[mock] userinfo ok -> {TEST_USER}")
    return TEST_USER


if __name__ == "__main__":
    print(f"mock parichay on http://localhost:{PORT}")
    print(f"  client_id={CLIENT_ID}  client_secret={CLIENT_SECRET}")
    print("  see the module docstring for the AUTH_PROVIDERS line to paste into .env")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
