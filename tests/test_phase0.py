import json
from fastapi.testclient import TestClient
from scribe.main import create_app
from scribe_core.auth import JWT_PAYLOAD_HEADER, Principal, get_principal
from scribe_core.logging import get_logger

def test_ping_and_discovery():
    c = TestClient(create_app())
    assert c.get("/voice/ping").json() == {"ping": "pong"}
    d = c.get("/voice/v1/.well-known/medscribealliance").json()
    assert "aws" in d["capabilities"]["storage_providers"]

def test_jwt_payload_injected(monkeypatch):
    monkeypatch.delenv("DEV_AUTH_TOKEN", raising=False)
    from scribe_core.settings import get_settings
    get_settings.cache_clear()
    app = create_app()
    @app.get("/whoami-test")
    async def whoami(request):  # noqa
        ...
    from fastapi import Request, Depends
    @app.get("/principal-test")
    async def p(principal: Principal = Depends(get_principal)):
        return {"b_id": principal.b_id, "paid": principal.is_paid}
    c = TestClient(app)
    r = c.get("/principal-test").json()
    assert r == {"b_id": "onprem-workspace", "paid": True}

def test_principal_roundtrip():
    p = Principal.from_jwt_payload({"b-id": "x", "uuid": "u", "oid": "o", "iss": "i", "cc": {"esc": 1}, "c-id": "c"})
    assert p.is_paid and p.client_id == "c"
    assert Principal.from_jwt_payload(p.to_jwt_payload()) == p

def test_logger_kwargs(tmp_path, monkeypatch):
    log = get_logger("test")
    log.info("hello", txn_id="t1", n=2)  # must not raise
