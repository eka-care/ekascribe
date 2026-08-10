"""
Redis-backed session store for provider-independent audio streams.

Generalizes the TelephonySessionStore to support any stream client — telephony
providers (Vobiz, Exotel, Plivo), mobile apps, Zoom, 100ms, or any WebSocket
audio client.

Key namespaces:
  stream:session:{stream_id}  — session metadata JSON
  stream:chunks:{stream_id}   — Redis list of uploaded S3 chunk filenames

A 'stream_id' is the unique identifier for a streaming session, separate
from the protocol 'session_id'.  The session_id ties to the backend transaction
(DynamoDB); the stream_id is created when streaming begins and maps to it.
"""

import os
from typing import Any, Dict, List, Optional

import orjson
import redis.asyncio as aioredis

from logs.custom_logger import get_logger

logger = get_logger(__name__)

_KEY_PREFIX = "stream:session"
_CHUNKS_PREFIX = "stream:chunks"
_DEFAULT_TTL = 7200  # 2 hours


def _get_redis_url() -> str:
    url = os.getenv("REDIS_URL", "")
    if url:
        return url
    host = os.getenv("REDIS_HOST", "localhost")
    port = os.getenv("REDIS_PORT", "6379")
    if host.startswith("redis://"):
        return host
    return f"redis://{host}:{port}"


class StreamSessionStore:
    """
    Async Redis client for provider-independent streaming session lifecycle.

    Stores:
      - session metadata: session_id, b_id, s3_url, batch_s3_url, provider,
                          caller_number, status, additional_data
      - chunk list: ordered list of S3 filenames uploaded for this stream
    """

    def __init__(self) -> None:
        self._redis: Optional[aioredis.Redis] = None

    async def _get_client(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                _get_redis_url(),
                decode_responses=False,
            )
        return self._redis

    async def save_session(
        self,
        stream_id: str,
        data: Dict[str, Any],
        ttl: int = _DEFAULT_TTL,
    ) -> None:
        r = await self._get_client()
        key = f"{_KEY_PREFIX}:{stream_id}"
        await r.set(key, orjson.dumps(data), ex=ttl)
        logger.info("Stream session saved to Redis", stream_id=stream_id, severity="medium")

    async def get_session(self, stream_id: str) -> Optional[Dict[str, Any]]:
        r = await self._get_client()
        raw = await r.get(f"{_KEY_PREFIX}:{stream_id}")
        if raw is None:
            return None
        return orjson.loads(raw)

    async def update_session(
        self,
        stream_id: str,
        data: Dict[str, Any],
        ttl: int = _DEFAULT_TTL,
    ) -> None:
        existing = await self.get_session(stream_id)
        if existing is None:
            existing = {}
        existing.update(data)
        await self.save_session(stream_id, existing, ttl)

    async def update_chunks(self, stream_id: str, new_chunks: List[str]) -> None:
        """Append new S3 chunk filenames to the stream's chunk list."""
        r = await self._get_client()
        key = f"{_CHUNKS_PREFIX}:{stream_id}"
        if new_chunks:
            await r.rpush(key, *[c.encode() for c in new_chunks])
            await r.expire(key, _DEFAULT_TTL)

    async def get_chunks(self, stream_id: str) -> List[str]:
        """Return all uploaded chunk filenames for this stream, in order."""
        r = await self._get_client()
        raw_list = await r.lrange(f"{_CHUNKS_PREFIX}:{stream_id}", 0, -1)
        return [item.decode() if isinstance(item, bytes) else item for item in raw_list]

    async def get_next_chunk_index(self, stream_id: str) -> int:
        """Return the 1-based index for the next chunk to be uploaded."""
        r = await self._get_client()
        length = await r.llen(f"{_CHUNKS_PREFIX}:{stream_id}")
        return length + 1

    async def delete_session(self, stream_id: str) -> None:
        r = await self._get_client()
        await r.delete(
            f"{_KEY_PREFIX}:{stream_id}",
            f"{_CHUNKS_PREFIX}:{stream_id}",
        )
        logger.info("Stream session cleaned up from Redis", stream_id=stream_id, severity="medium")

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None


stream_session_store = StreamSessionStore()
