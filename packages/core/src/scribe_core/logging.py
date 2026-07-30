"""File-based logging that preserves voice2rx-be's logger contract.

The forked code calls ``get_logger(__name__)`` and then ``logger.info(msg, **kwargs)``
(New Relic style). We keep that exact signature so no call sites change; kwargs are
rendered as JSON fields on the line. Handlers: rotating file in LOG_DIR + stderr.
"""

from __future__ import annotations

import json
import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

_CONFIGURED = False


class _KwargsAdapter(logging.LoggerAdapter):
    """Accepts arbitrary **kwargs on log calls and folds them into the message."""

    _RESERVED = {"exc_info", "stack_info", "stacklevel", "extra"}

    def _fold(self, msg, kwargs):
        passthrough = {k: v for k, v in kwargs.items() if k in self._RESERVED}
        fields = {k: v for k, v in kwargs.items() if k not in self._RESERVED}
        if fields:
            try:
                msg = f"{msg} | {json.dumps(fields, default=str, ensure_ascii=False)}"
            except Exception:
                msg = f"{msg} | {fields!r}"
        return msg, passthrough

    def debug(self, msg, *args, **kwargs):
        msg, kw = self._fold(msg, kwargs); self.logger.debug(msg, *args, **kw)

    def info(self, msg, *args, **kwargs):
        msg, kw = self._fold(msg, kwargs); self.logger.info(msg, *args, **kw)

    def warning(self, msg, *args, **kwargs):
        msg, kw = self._fold(msg, kwargs); self.logger.warning(msg, *args, **kw)

    def error(self, msg, *args, **kwargs):
        msg, kw = self._fold(msg, kwargs); self.logger.error(msg, *args, **kw)

    def exception(self, msg, *args, **kwargs):
        kwargs.setdefault("exc_info", True)
        msg, kw = self._fold(msg, kwargs); self.logger.error(msg, *args, **kw)

    def critical(self, msg, *args, **kwargs):
        msg, kw = self._fold(msg, kwargs); self.logger.critical(msg, *args, **kw)


def _configure_root() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    from scribe_core.settings import get_settings

    s = get_settings()
    root = logging.getLogger("scribe")
    root.setLevel(s.log_level.upper())
    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S%z"
    )

    log_dir = Path(s.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    fh = RotatingFileHandler(
        log_dir / "scribe.log", maxBytes=s.log_max_bytes, backupCount=s.log_backup_count
    )
    fh.setFormatter(fmt)
    root.addHandler(fh)

    sh = logging.StreamHandler(sys.stderr)
    sh.setFormatter(fmt)
    root.addHandler(sh)

    root.propagate = False
    _CONFIGURED = True


def get_logger(name: str) -> _KwargsAdapter:
    """Drop-in replacement for the New Relic-backed logger in voice2rx-be."""
    _configure_root()
    return _KwargsAdapter(logging.getLogger(f"scribe.{name}"), {})
