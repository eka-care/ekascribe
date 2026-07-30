"""
Share a single ONNX InferenceSession across every SileroVADAnalyzer.

Pipecat's `SileroOnnxModel.__init__` builds a fresh `onnxruntime.InferenceSession`
for every analyzer, which reserves its own thread pools and memory arenas
(~50–100MB). With one analyzer per streaming WebSocket, concurrent calls quickly
push the pod past its 2Gi limit and trigger kubelet liveness restarts.

`InferenceSession.run()` is thread-safe — the session's weights and compiled
graph are read-only after init — so one session can serve every stream. Only
the tiny per-stream state (`_state`, `_context`, last sample rate, last batch
size) stays per-instance.
"""

from __future__ import annotations

import threading

import onnxruntime
from pipecat.audio.vad.silero import SileroOnnxModel

_session_lock = threading.Lock()
_shared_session: onnxruntime.InferenceSession | None = None
_patched = False


def _patched_init(self, path, force_onnx_cpu: bool = True) -> None:
    global _shared_session

    with _session_lock:
        if _shared_session is None:
            opts = onnxruntime.SessionOptions()
            opts.inter_op_num_threads = 1
            opts.intra_op_num_threads = 1

            providers = None
            if (
                force_onnx_cpu
                and "CPUExecutionProvider" in onnxruntime.get_available_providers()
            ):
                providers = ["CPUExecutionProvider"]

            _shared_session = onnxruntime.InferenceSession(
                path, providers=providers, sess_options=opts
            )

    self.session = _shared_session
    self.reset_states()
    self.sample_rates = [8000, 16000]


def install() -> None:
    global _patched
    if _patched:
        return
    SileroOnnxModel.__init__ = _patched_init
    _patched = True


install()
