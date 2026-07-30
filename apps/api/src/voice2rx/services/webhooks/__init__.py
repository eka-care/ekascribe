"""Pluggable async webhook delivery for ekascribe events.

Usage from any context (async route, sync route, BackgroundTasks, thread):

    from voice2rx.services.webhooks import emit, ScribeEvent

    emit(
        ScribeEvent.SESSION_INIT,
        b_id=b_id,
        c_id=c_id,
        txn_id=txn_id,
        data=build_session_data(txn_id),
    )

`emit` is fire-and-forget and never raises; delivery is gated on `c_id`
(connect clients only) inside the dispatcher.
"""

import asyncio
import threading
from typing import Any, Dict, Optional, Union

from logs.custom_logger import get_logger
from voice2rx.services.webhooks.backends import (
    DeliveryResult,
    MessengerBackend,
    WebhookBackend,
)
from voice2rx.services.webhooks.dispatcher import WebhookDispatcher
from voice2rx.services.webhooks.events import (
    EVENT_REGISTRY,
    ScribeEvent,
    build_document_data,
    build_envelope,
    build_session_data,
    build_transcript_data,
)

logger = get_logger(__name__)

__all__ = [
    "DeliveryResult",
    "EVENT_REGISTRY",
    "MessengerBackend",
    "ScribeEvent",
    "WebhookBackend",
    "WebhookDispatcher",
    "build_document_data",
    "build_envelope",
    "build_session_data",
    "build_transcript_data",
    "emit",
    "emit_raw",
    "get_dispatcher",
    "set_dispatcher",
]

_dispatcher: Optional[WebhookDispatcher] = None
_dispatcher_lock = threading.Lock()

_loop: Optional[asyncio.AbstractEventLoop] = None
_loop_lock = threading.Lock()


def get_dispatcher() -> WebhookDispatcher:
    global _dispatcher
    if _dispatcher is None:
        with _dispatcher_lock:
            if _dispatcher is None:
                _dispatcher = WebhookDispatcher()
    return _dispatcher


def set_dispatcher(dispatcher: Optional[WebhookDispatcher]) -> None:
    """Test seam: swap the dispatcher singleton (pass None to reset)."""
    global _dispatcher
    _dispatcher = dispatcher


def _background_loop() -> asyncio.AbstractEventLoop:
    # sync callers (BackgroundTasks threadpool, publish threads) have no running
    # loop — dispatch on a shared daemon-thread loop so retries/backoff never
    # block the caller
    global _loop
    if _loop is None or _loop.is_closed():
        with _loop_lock:
            if _loop is None or _loop.is_closed():
                loop = asyncio.new_event_loop()
                thread = threading.Thread(
                    target=loop.run_forever,
                    name="webhook-dispatch-loop",
                    daemon=True,
                )
                thread.start()
                _loop = loop
    return _loop


# the event loop only keeps weak references to tasks — hold strong refs until
# done so an in-flight dispatch can't be garbage-collected mid-delivery
_pending_tasks: set = set()


def _fire(coro) -> None:
    try:
        task = asyncio.get_running_loop().create_task(coro)
        _pending_tasks.add(task)
        task.add_done_callback(_pending_tasks.discard)
    except RuntimeError:
        asyncio.run_coroutine_threadsafe(coro, _background_loop())


def emit(
    event_id: Union[str, ScribeEvent],
    *,
    b_id: str,
    c_id: Optional[str],
    txn_id: str,
    data: Optional[Dict[str, Any]] = None,
) -> None:
    """Fire-and-forget webhook dispatch. Safe to call from any context."""
    try:
        _fire(
            get_dispatcher().dispatch(
                event_id, b_id=b_id, c_id=c_id, txn_id=txn_id, data=data
            )
        )
    except Exception as exc:
        logger.error(
            "WEBHOOK: emit failed",
            event_id=getattr(event_id, "value", event_id),
            txn_id=txn_id,
            error=str(exc),
            severity="critical",
        )


def emit_raw(envelope: Dict[str, Any], url_override: Optional[str] = None) -> None:
    """Fire-and-forget dispatch of a pre-built envelope (legacy payloads)."""
    try:
        _fire(get_dispatcher().dispatch_raw(envelope, url_override=url_override))
    except Exception as exc:
        logger.error(
            "WEBHOOK: emit_raw failed",
            event_id=envelope.get("event_id", ""),
            error=str(exc),
            severity="critical",
        )
