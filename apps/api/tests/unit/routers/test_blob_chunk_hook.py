"""The blob-upload route must start per-chunk STT as each chunk lands.

The web app (version=v2, chunked) gets a presigned POST from create-session and
posts every audio chunk straight to /voice/v1/blob-upload/{bucket}, never
touching /voice/v1/sessions/{id}/audio/{file}. If this route doesn't dispatch,
nothing is transcribed until commit and process_session ends up doing all N
chunks in one burst — the regression these tests pin down.
"""

import time

import pytest

from scribe.routers import blob_router as blob_router_module
from scribe_core.storage import make_blob_token

BUCKET = "voice-records"
PREFIX = "sessions/EC_test/sc-abc123"


@pytest.fixture(autouse=True)
def stub_store_and_dispatch(monkeypatch):
    """Capture dispatches; never touch real storage or the transaction table.

    The language lookup is stubbed one level below the router's cache
    (pipeline.session_language) so the cache itself stays under test.
    """
    dispatched = []
    written = []
    lang_calls = []

    class _Store:
        def put(self, bucket, key, body, content_type=None, metadata=None):
            written.append((bucket, key, len(body)))

    monkeypatch.setattr(blob_router_module, "get_blob_store", lambda: _Store())
    monkeypatch.setattr(
        "scribe.pipeline.pipeline.session_language",
        lambda txn_id, b_id="": lang_calls.append((txn_id, b_id)) or "hi",
    )

    import scribe.pipeline.dispatch as dispatch_module

    monkeypatch.setattr(
        dispatch_module,
        "dispatch",
        lambda task, payload, delay_seconds=0: dispatched.append((task, payload)),
    )
    blob_router_module._LANG_CACHE.clear()
    return {"dispatched": dispatched, "written": written, "lang_calls": lang_calls}


def _post(client, filename, *, key=None, txnid="sc-abc123", bid="EC_test", prefix=PREFIX):
    expires = int(time.time()) + 3600
    fields = {
        "key": key if key is not None else f"{prefix}/{filename}",
        "x-scribe-prefix": prefix,
        "x-scribe-expires": str(expires),
        "x-scribe-token": make_blob_token("POST", BUCKET, prefix, expires),
    }
    if txnid:
        fields["x-amz-meta-txnid"] = txnid
    if bid:
        fields["x-amz-meta-bid"] = bid
    return client.post(
        f"/voice/v1/blob-upload/{BUCKET}",
        data=fields,
        files={"file": (filename, b"fake-audio-bytes", "audio/webm")},
    )


# --- the fix ----------------------------------------------------------------


def test_audio_chunk_upload_dispatches_stt(client, stub_store_and_dispatch):
    resp = _post(client, "0.webm")

    assert resp.status_code == 204
    assert stub_store_and_dispatch["written"] == [(BUCKET, f"{PREFIX}/0.webm", 16)]

    dispatched = stub_store_and_dispatch["dispatched"]
    assert len(dispatched) == 1
    task, payload = dispatched[0]
    assert task == "transcribe_chunk"
    assert payload == {
        "txn_id": "sc-abc123",
        "b_id": "EC_test",
        "s3_url": f"s3://{BUCKET}/{PREFIX}",
        "filename": "0.webm",
        "language": "hi",
    }


def test_every_chunk_dispatches_its_own_job(client, stub_store_and_dispatch):
    """10 chunks in a session -> 10 jobs, one per chunk, as they arrive."""
    for i in range(10):
        assert _post(client, f"{i}.webm").status_code == 204

    dispatched = stub_store_and_dispatch["dispatched"]
    assert [p["filename"] for _, p in dispatched] == [f"{i}.webm" for i in range(10)]
    assert all(t == "transcribe_chunk" for t, _ in dispatched)


@pytest.mark.parametrize("ext", ["m4a", "mp3", "wav", "webm", "ogg", "mp4", "aac"])
def test_all_supported_audio_extensions(client, stub_store_and_dispatch, ext):
    assert _post(client, f"3.{ext}").status_code == 204
    assert len(stub_store_and_dispatch["dispatched"]) == 1


# --- must NOT fire ----------------------------------------------------------


@pytest.mark.parametrize(
    "filename",
    [
        "0.transcript.json",  # our own STT artifact
        "transcript.txt",     # stitched transcript
        "header.png",         # print header image
        "audio_0.webm",       # un-normalised name (never written by the SDK)
        "notes.pdf",
    ],
)
def test_non_chunk_objects_do_not_dispatch(client, stub_store_and_dispatch, filename):
    assert _post(client, filename).status_code == 204
    assert stub_store_and_dispatch["dispatched"] == []


def test_nested_key_is_not_treated_as_a_chunk(client, stub_store_and_dispatch):
    """transcribe_chunk rebuilds the path as {prefix}/{filename}, so a nested
    key would point at an object that doesn't exist."""
    resp = _post(client, "0.webm", key=f"{PREFIX}/sub/0.webm")
    assert resp.status_code == 204
    assert stub_store_and_dispatch["dispatched"] == []


def test_missing_txnid_metadata_does_not_dispatch(client, stub_store_and_dispatch):
    """No session to attribute the chunk to — commit-time sweep still covers it."""
    assert _post(client, "0.webm", txnid="").status_code == 204
    assert stub_store_and_dispatch["dispatched"] == []


def test_key_outside_signed_prefix_is_rejected_before_dispatch(
    client, stub_store_and_dispatch
):
    resp = _post(client, "0.webm", key="sessions/other-tenant/sc-evil/0.webm")
    assert resp.status_code == 403
    assert stub_store_and_dispatch["dispatched"] == []
    assert stub_store_and_dispatch["written"] == []


# --- resilience -------------------------------------------------------------


def test_dispatch_failure_does_not_fail_the_upload(client, stub_store_and_dispatch, monkeypatch):
    """The chunk is already stored; process_session re-dispatches at commit."""
    import scribe.pipeline.dispatch as dispatch_module

    def _boom(task, payload, delay_seconds=0):
        raise RuntimeError("queue is down")

    monkeypatch.setattr(dispatch_module, "dispatch", _boom)

    resp = _post(client, "0.webm")
    assert resp.status_code == 204
    assert stub_store_and_dispatch["written"] == [(BUCKET, f"{PREFIX}/0.webm", 16)]


def test_session_language_resolved_once_per_session(client, stub_store_and_dispatch):
    """One transaction read per session, not one per chunk."""
    for i in range(5):
        assert _post(client, f"{i}.webm").status_code == 204

    assert stub_store_and_dispatch["lang_calls"] == [("sc-abc123", "EC_test")]
    assert len(stub_store_and_dispatch["dispatched"]) == 5


def test_language_cache_stays_bounded():
    """Long-running pods must not accumulate a row per session forever."""
    blob_router_module._LANG_CACHE.clear()
    for i in range(blob_router_module._LANG_CACHE_MAX + 50):
        blob_router_module._cached_session_language(f"sc-{i}", "EC_test")
    assert len(blob_router_module._LANG_CACHE) == blob_router_module._LANG_CACHE_MAX
