"""Usage metering removed for the open-source fork (plan B4).

No-op stubs preserve the old eka-usage-sdk call sites' signatures so the three
callers (sessions.py, init_router.py, metrics.py) work unchanged. Delete the
call sites at leisure; nothing is recorded.
"""

from __future__ import annotations

from typing import Any


class _NoopClient:
    def record(self, *args, **kwargs) -> None:  # pragma: no cover
        pass

    def shutdown(self, *args, **kwargs) -> None:  # pragma: no cover
        pass


_client = _NoopClient()


def get_client() -> _NoopClient:
    return _client


def shutdown_client(timeout: float = 10.0) -> None:
    return None


def record_safe(*args: Any, **kwargs: Any) -> None:
    """Previously reported usage events to eka's metering; now a no-op."""
    return None
