"""Phase 1: local blob store + blob router + account endpoints."""

import io

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("DEV_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path / "storage"))
    monkeypatch.setenv("LOG_DIR", str(tmp_path / "logs"))
    from scribe_core import storage
    from scribe_core.settings import get_settings

    get_settings.cache_clear()
    storage.reset_blob_store()

    from scribe.main import create_app

    yield TestClient(create_app())
    get_settings.cache_clear()
    storage.reset_blob_store()


def test_blob_put_get_roundtrip(client):
    from scribe_core.storage import get_blob_store

    store = get_blob_store()
    put_url = store.presigned_put_url("voice-records", "260730/txn1/output.json")
    get_url = store.presigned_get_url("voice-records", "260730/txn1/output.json")

    path_q = put_url.split("http://localhost:8000")[1]
    r = client.put(path_q, content=b'{"a": 1}', headers={"content-type": "application/json"})
    assert r.status_code == 200, r.text

    r = client.get(get_url.split("http://localhost:8000")[1])
    assert r.status_code == 200
    assert r.content == b'{"a": 1}'
    assert store.get("voice-records", "260730/txn1/output.json") == b'{"a": 1}'


def test_blob_get_bad_token_rejected(client):
    from scribe_core.storage import get_blob_store

    store = get_blob_store()
    store.put("voice-records", "260730/txn2/1.m4a", b"audio")
    url = store.presigned_get_url("voice-records", "260730/txn2/1.m4a")
    tampered = url.replace("token=", "token=dead")
    assert client.get(tampered.split("http://localhost:8000")[1]).status_code == 403


def test_s3_shaped_post_upload(client):
    from scribe_core.storage import get_blob_store

    store = get_blob_store()
    form = store.presigned_post(
        "voice-records", "260730/txn3", metadata={"bid": "b1", "txnid": "txn3"}
    )
    assert form["fields"]["key"] == "260730/txn3/${filename}"

    fields = dict(form["fields"])
    fields["key"] = fields["key"].replace("${filename}", "audio_0.webm")
    r = client.post(
        form["url"].split("http://localhost:8000")[1],
        data=fields,
        files={"file": ("audio_0.webm", io.BytesIO(b"webm-bytes"), "audio/webm")},
    )
    assert r.status_code == 204, r.text
    assert store.get("voice-records", "260730/txn3/audio_0.webm") == b"webm-bytes"


def test_post_outside_prefix_rejected(client):
    from scribe_core.storage import get_blob_store

    form = get_blob_store().presigned_post("voice-records", "260730/txn4")
    fields = dict(form["fields"])
    fields["key"] = "other-prefix/evil.bin"
    r = client.post(
        form["url"].split("http://localhost:8000")[1],
        data=fields,
        files={"file": ("evil.bin", io.BytesIO(b"x"), "audio/webm")},
    )
    assert r.status_code == 403


def test_whoami(client):
    r = client.get("/connect-auth/v1/account/whoami")
    assert r.status_code == 200
    body = r.json()
    assert body["workspace_id"] == "onprem-workspace"
    assert body["uuid"] and body["primary_oid"]


def test_discovery_parameterized(client):
    r = client.get("/voice/v1/.well-known/medscribealliance")
    assert r.status_code == 200
    d = r.json()
    assert "eka.care" not in str(d)
    assert d["endpoints"]["base_url"].startswith("http://localhost:8000/voice")
    assert d["capabilities"]["upload_methods"] == ["chunked", "single"]  # streaming flagged off


def test_discovery_public_even_with_dev_token(tmp_path, monkeypatch):
    monkeypatch.setenv("DEV_AUTH_TOKEN", "sekret")
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path / "s"))
    monkeypatch.setenv("LOG_DIR", str(tmp_path / "l"))
    from scribe_core import storage
    from scribe_core.settings import get_settings

    get_settings.cache_clear()
    storage.reset_blob_store()
    from fastapi.testclient import TestClient

    from scribe.main import create_app

    c = TestClient(create_app())
    # public endpoints work without the token
    assert c.get("/voice/v1/.well-known/medscribealliance").status_code == 200
    assert c.get("/voice/ping").status_code == 200
    # everything else requires it
    assert c.get("/connect-auth/v1/account/whoami").status_code == 401
    assert (
        c.get(
            "/connect-auth/v1/account/whoami",
            headers={"Authorization": "Bearer sekret"},
        ).status_code
        == 200
    )
    get_settings.cache_clear()
    storage.reset_blob_store()
