"""Pipeline jobs x chunk-state integration (claims gate STT; commit waits)."""

from unittest.mock import MagicMock, patch

from scribe.pipeline import pipeline


PATCH_STATE = "scribe.pipeline.pipeline.chunk_state"


def test_transcribe_chunk_skips_when_claim_lost():
    with patch(PATCH_STATE) as state, \
         patch("scribe.pipeline.pipeline._transcribe_chunk_sync") as stt:
        state.claim_chunk.return_value = False

        pipeline.transcribe_chunk("t1", "b1", "s3://bkt/pre", "0.webm")

        stt.assert_not_called()
        state.mark_done.assert_not_called()


def test_transcribe_chunk_marks_done_on_success():
    with patch(PATCH_STATE) as state, \
         patch("scribe.pipeline.pipeline._transcribe_chunk_sync") as stt:
        state.claim_chunk.return_value = True
        stt.return_value = {"text": "hello"}

        pipeline.transcribe_chunk("t1", "b1", "s3://bkt/pre", "0.webm")

        stt.assert_called_once()
        state.mark_done.assert_called_once()


def test_transcribe_chunk_marks_failed_and_reraises():
    with patch(PATCH_STATE) as state, \
         patch("scribe.pipeline.pipeline._transcribe_chunk_sync") as stt:
        state.claim_chunk.return_value = True
        stt.side_effect = RuntimeError("stt down")

        try:
            pipeline.transcribe_chunk("t1", "b1", "s3://bkt/pre", "0.webm")
            raised = False
        except RuntimeError:
            raised = True

        assert raised
        state.mark_failed.assert_called_once()
        state.mark_done.assert_not_called()


def test_process_session_waits_and_redispatches_while_chunks_pending():
    message = {"txn_id": "t1", "b_id": "b1", "s3_url": "s3://bkt/pre"}
    with patch(PATCH_STATE) as state, \
         patch("scribe.pipeline.pipeline._chunk_files") as files, \
         patch("scribe.pipeline.pipeline.dispatch") as disp, \
         patch("scribe.pipeline.pipeline._patch_transaction") as patch_txn:
        files.return_value = [(0, "pre/0.webm"), (1, "pre/1.webm")]
        state.not_done_chunks.return_value = ["1.webm"]

        pipeline.process_session(message)

        # re-dispatched the missing chunk + a delayed self-check; no PATCH yet
        dispatched = [c.args[0] for c in disp.call_args_list]
        assert dispatched.count("transcribe_chunk") == 1
        assert "process_session" in dispatched
        follow_up = [c for c in disp.call_args_list if c.args[0] == "process_session"][0]
        assert follow_up.args[1]["message"]["attempt"] == 1
        patch_txn.assert_not_called()
