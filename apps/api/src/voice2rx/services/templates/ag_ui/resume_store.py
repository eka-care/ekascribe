"""
Redis-backed PausedRunStore for AG-UI runs that pause on UI tool calls.

Implements the echo.ag_ui.PausedRunStore Protocol. Mirrors the
existing StreamSessionStore pattern (lazy-init aioredis client, env-
driven URL, orjson serialization).

Encryption-at-rest: deferred per docs/ag_ui_implementation_plan.md §9.
Until that decision is made, paused-run blobs may include patient
transcript fragments — Redis access must stay restricted to the
application via VPC + auth.
"""

import os
from dataclasses import asdict
from typing import Optional

import orjson
import redis.asyncio as aioredis
from echo.ag_ui import PausedRun
from logs.custom_logger import get_logger

logger = get_logger(__name__)


_DEFAULT_TTL = 1800  # 30 minutes — matches the resume window in the plan


def _get_redis_url() -> str:
    """Resolve Redis URL from env. Reuses the same conventions as
    StreamSessionStore so deployments don't need separate config."""
    url = os.getenv("REDIS_URL", "")
    if url:
        return url
    host = os.getenv("REDIS_HOST", "localhost")
    port = os.getenv("REDIS_PORT", "6379")
    if host.startswith("redis://"):
        return host
    return f"redis://{host}:{port}"


class RedisPausedRunStore:
    """Async Redis-backed implementation of echo.ag_ui.PausedRunStore.

    Stores PausedRun snapshots as JSON under
    ``ag_ui:paused_run:{thread_id}:{run_id}`` (the make_pause_key()
    convention from echo.ag_ui). Default TTL 30 min — past which the
    paused run is considered expired and a /resume request returns
    a structured RUN_ERROR.

    Constructor accepts an optional pre-built ``aioredis.Redis``
    client (mostly for tests); production code uses the lazy default.
    """

    def __init__(self, client: Optional[aioredis.Redis] = None) -> None:
        self._redis: Optional[aioredis.Redis] = client

    async def _get_client(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                _get_redis_url(),
                decode_responses=False,
            )
        return self._redis

    async def save(self, key: str, snapshot: PausedRun, ttl: int = _DEFAULT_TTL) -> None:
        r = await self._get_client()
        payload = orjson.dumps(asdict(snapshot))
        await r.set(key, payload, ex=ttl)
        logger.info(
            "paused_run saved to redis",
            key=key,
            ttl=ttl,
            thread_id=snapshot.thread_id,
            run_id=snapshot.run_id,
            tool_call_id=snapshot.tool_call_id,
        )

    async def load(self, key: str) -> Optional[PausedRun]:
        r = await self._get_client()
        raw = await r.get(key)
        if raw is None:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        try:
            data = orjson.loads(raw)
        except orjson.JSONDecodeError:
            logger.error(
                "paused_run blob is not valid JSON; ignoring",
                key=key,
                severity="medium",
            )
            return None
        try:
            return PausedRun(**data)
        except TypeError as e:
            # Schema drift between PausedRun and the stored blob —
            # treat as expired so the FE re-runs from scratch instead
            # of crashing the whole resume.
            logger.error(
                "paused_run blob does not match PausedRun schema",
                key=key,
                error=str(e),
                severity="medium",
            )
            return None

    async def delete(self, key: str) -> None:
        r = await self._get_client()
        await r.delete(key)
        logger.info("paused_run deleted from redis", key=key)

    async def close(self) -> None:
        """Close the underlying Redis connection. Optional; the FastAPI
        lifespan can call this on shutdown."""
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None


# Module-level singleton, instantiated on first import. AgUiRunService
# (in run_service.py) reads paused_run_store from its constructor;
# the endpoint layer wires this singleton in.
redis_paused_run_store = RedisPausedRunStore()
