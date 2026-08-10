"""File-backed logger (New Relic removed — body swap, signature preserved).

All forked call sites keep doing:
    logger = get_logger(__name__)
    logger.info("Message", txn_id="123", b_id="456")
The implementation now lives in scribe_core.logging (rotating file + stderr).
"""

from scribe_core.logging import get_logger  # noqa: F401
