"""
LangfuseTemplateSync - write-side sync of markdown-only templates to Langfuse.

Templates are mirrored as text prompts named `{slug(title)}-{template_id}`. The
name is stable across renames because callers persist it on the template row
and pass it back on subsequent updates. Section-based templates are not synced.

All operations are gated on ENV=prod and Langfuse credentials being present.
Failures are raised; callers in strict mode let them propagate as 5xx.
"""

import os
import re
from typing import Optional, Union
from langfuse import Langfuse
from logs.custom_logger import get_logger

try:  # SDK layout guard - keep import-safe if the api module moves
    from langfuse.api import NotFoundError as _LangfuseNotFoundError
except Exception:  # pragma: no cover
    _LangfuseNotFoundError = None

logger = get_logger(__name__)


_SLUG_RE = re.compile(r"[^a-z0-9]+")


class _PromptDeleted:
    """Sentinel: Langfuse (the source of truth) has no such prompt.

    Distinct from ``None``/DB-cache fallback: this means the prompt was
    deleted from Langfuse, so the template content no longer exists and the
    template should be excluded from reads rather than served from cache.
    """

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return "<PROMPT_DELETED>"


PROMPT_DELETED = _PromptDeleted()


def _is_not_found(exc: Exception) -> bool:
    """True when an exception means 'prompt does not exist' (vs. transient)."""
    if _LangfuseNotFoundError is not None and isinstance(exc, _LangfuseNotFoundError):
        return True
    if getattr(exc, "status_code", None) == 404:
        return True
    return "not found" in str(exc).lower()


def _slugify(value: str) -> str:
    slug = _SLUG_RE.sub("-", (value or "").lower()).strip("-")
    return slug or "template"


class LangfuseTemplateSync:

    def __init__(self) -> None:
        self._client = None

    def is_active(self) -> bool:
        if os.getenv("ENV") != "prod":
            return False
        return bool(
            os.getenv("LANGFUSE_SECRET_KEY")
            and os.getenv("LANGFUSE_PUBLIC_KEY")
            and os.getenv("LANGFUSE_BASE_URL")
        )

    def _get_client(self):
        if self._client is not None:
            return self._client
        self._client = Langfuse(
            secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
            public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
            base_url=os.getenv("LANGFUSE_BASE_URL"),
        )
        return self._client

    @staticmethod
    def build_prompt_name(template_name: str, template_id: str) -> str:
        return f"{_slugify(template_name)}-{template_id}"

    def create(
        self,
        *,
        template_id: str,
        template_name: str,
        desc: str,
        wid: str,
    ) -> str:
        name = self.build_prompt_name(template_name, template_id)
        self._upsert(
            name=name,
            template_id=template_id,
            template_name=template_name,
            desc=desc,
            wid=wid,
        )
        return name

    def update(
        self,
        *,
        langfuse_prompt_name: str,
        template_id: str,
        template_name: str,
        desc: str,
        wid: str,
    ) -> None:
        self._upsert(
            name=langfuse_prompt_name,
            template_id=template_id,
            template_name=template_name,
            desc=desc,
            wid=wid,
        )

    def _upsert(
        self,
        *,
        name: str,
        template_id: str,
        template_name: str,
        desc: str,
        wid: str,
    ) -> None:
        client = self._get_client()
        client.create_prompt(
            name=name,
            prompt=desc,
            type="text",
            labels=["production"],
            tags=[
                "voice2rx-template",
                f"wid:{wid}",
                f"template_id:{template_id}",
            ],
            commit_message=template_name,
        )
        logger.info(
            "Langfuse template synced",
            prompt_name=name,
            template_id=template_id,
            wid=wid,
            severity="medium",
        )

    def hydrate_desc(self, template: dict) -> Union[Optional[str], _PromptDeleted]:
        """Resolve the authoritative content (`desc`) for a template.

        Langfuse is the source of truth for the prompt content of markdown-only
        templates (no `section_ids`). When active and a pointer exists:
            - prompt found     -> the Langfuse value
            - prompt deleted    -> ``PROMPT_DELETED`` sentinel (no DB fallback;
                                   callers exclude the template from reads)
            - transient failure -> the DB-cached `desc` (so a Langfuse blip
                                   doesn't wipe templates from the catalog)
        When inactive / not markdown-only / no pointer, returns the DB `desc`.
        """
        db_desc = template.get("desc")
        if not self.is_active():
            return db_desc
        if template.get("section_ids"):
            return db_desc
        name = template.get("langfuse_prompt_name")
        if not name:
            return db_desc
        try:
            return self._fetch_compiled(name)
        except Exception as e:
            if _is_not_found(e):
                logger.warning(
                    "Langfuse template prompt deleted; excluding from reads",
                    prompt_name=name,
                    severity="medium",
                )
                return PROMPT_DELETED
            logger.warning(
                "Langfuse template fetch failed; serving DB cache",
                prompt_name=name,
                error=str(e),
                severity="medium",
            )
            return db_desc

    def _fetch_compiled(self, langfuse_prompt_name: str) -> str:
        """Fetch + compile a prompt, bypassing the SDK cache so deletions are
        observed immediately. Raises on not-found / transient errors."""
        client = self._get_client()
        prompt = client.get_prompt(
            langfuse_prompt_name, label="production", cache_ttl_seconds=0
        )
        if prompt is None:
            raise ValueError(f"prompt not found: {langfuse_prompt_name}")
        compiled = prompt.compile()
        return compiled if isinstance(compiled, str) else ""

    def fetch_desc(self, langfuse_prompt_name: str) -> Optional[str]:
        """Graceful fetch: returns the compiled prompt or None on any failure."""
        try:
            return self._fetch_compiled(langfuse_prompt_name)
        except Exception as e:
            logger.warning(
                "Langfuse template fetch failed",
                prompt_name=langfuse_prompt_name,
                error=str(e),
                severity="medium",
            )
            return None


_sync_singleton: Optional[LangfuseTemplateSync] = None


def get_langfuse_template_sync() -> LangfuseTemplateSync:
    global _sync_singleton
    if _sync_singleton is None:
        _sync_singleton = LangfuseTemplateSync()
    return _sync_singleton
