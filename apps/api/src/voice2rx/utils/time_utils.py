from datetime import datetime, timezone
import time

def get_current_utc_timestamp():
    """
    Get current UTC timestamp in ISO format (legacy format).
    For new code, prefer get_current_epoch_timestamp().
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def get_current_epoch_timestamp():
    """
    Get current UTC timestamp as epoch (seconds since 1970-01-01).
    Returns integer timestamp for consistent storage and comparisons.
    """
    return int(time.time())

def iso_to_epoch(iso_timestamp: str) -> int:
    """
    Convert ISO format timestamp to epoch.
    
    Args:
        iso_timestamp: Timestamp in format "%Y-%m-%dT%H:%M:%SZ" or ISO format
    
    Returns:
        Epoch timestamp as integer
    """
    try:
        if isinstance(iso_timestamp, (int, float)):
            return int(iso_timestamp)
        # Handle ISO format with Z
        dt = datetime.fromisoformat(iso_timestamp.replace('Z', '+00:00'))
        return int(dt.timestamp())
    except Exception:
        # If parsing fails, return current time
        return int(time.time())

def epoch_to_iso(epoch_timestamp: int) -> str:
    """
    Convert epoch timestamp to ISO format.
    
    Args:
        epoch_timestamp: Epoch timestamp (seconds since 1970-01-01)
    
    Returns:
        ISO format timestamp string
    """
    try:
        dt = datetime.fromtimestamp(int(epoch_timestamp), tz=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
