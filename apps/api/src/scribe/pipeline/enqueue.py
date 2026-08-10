"""Pipeline enqueue helper.

Replaces the legacy SQSService bridge: session-processing jobs go straight
to dispatch() (in-process runner or the durable queue, per EXECUTION_MODE).
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any, Dict

from scribe.pipeline.dispatch import dispatch


class _DecimalEncoder(json.JSONEncoder):
    def default(self, obj):  # noqa: ANN001
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def enqueue_pipeline(message: Dict[str, Any], task: str = "process_session") -> Dict[str, Any]:
    """Enqueue one pipeline job. Returns {"success": bool, ...}."""
    try:
        payload = json.loads(json.dumps(message, cls=_DecimalEncoder))
        dispatch(task, {"message": payload})
        return {"success": True, "message_id": f"job:{task}"}
    except Exception as e:  # noqa: BLE001
        return {"success": False, "error": str(e)}
