import os
import json
from typing import Iterable


def load_env_from_json_env_vars(override: bool = False) -> None:
    """
    Read JSON blobs from the "voice2rx" environment variable and
    export each key/value into process environment, so code can use os.getenv("KEY").
    """
    try:
        raw = os.getenv("voice2rx")
        if not raw:
            return
        try:
            data = json.loads(raw)
        except Exception:
            return

        if not isinstance(data, dict):
            return

        for k, v in data.items():
            key = str(k)
            val = "" if v is None else str(v)
            if override or key not in os.environ:
                os.environ[key] = val
    except Exception:
        pass