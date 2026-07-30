#!/usr/bin/env python3
"""
Backfill existing production templates into Langfuse.

Scans ekascribe_template and pushes every row that is:
  - not archived (no `archived` attr, or archived != True)
  - markdown-only (has non-empty `desc` AND empty/missing `section_ids`)
  - not yet synced (no `langfuse_prompt_name` set)

Each row becomes a text prompt named `{slug(title)}-{template_id}` labelled
`production`, then the same name is written back to the Dynamo row so future
edits go through the regular update path in LangfuseTemplateSync.

Re-running the script is safe: rows already carrying `langfuse_prompt_name`
are skipped. Pass --include-synced to force re-push (e.g. after fixing a bad
batch) — that creates a new version under the existing name.

Usage:
    ENV=prod \
    LANGFUSE_SECRET_KEY=... LANGFUSE_PUBLIC_KEY=... LANGFUSE_BASE_URL=... \
    python scripts/sync_templates_to_langfuse.py [--dry-run] [--include-synced] [--wid WID] [--limit N]
"""
import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from logs.custom_logger import get_logger
from voice2rx.services.templates.langfuse_template_sync import (
    LangfuseTemplateSync,
)
from voice2rx.utils.dynamo_helper import DynamoHelper

logger = get_logger(__name__)

TEMPLATE_TABLE = "ekascribe_template"


class TemplateLangfuseBackfill:
    def __init__(
        self,
        *,
        dry_run: bool,
        include_synced: bool,
        wid_filter: str | None,
        limit: int | None,
    ) -> None:
        self.dry_run = dry_run
        self.include_synced = include_synced
        self.wid_filter = wid_filter
        self.limit = limit
        self.helper = DynamoHelper(TEMPLATE_TABLE)
        self.sync = LangfuseTemplateSync()
        self.stats = {
            "scanned": 0,
            "eligible": 0,
            "skipped_archived": 0,
            "skipped_section_based": 0,
            "skipped_no_desc": 0,
            "skipped_already_synced": 0,
            "skipped_wid_filter": 0,
            "synced": 0,
            "writeback_failed": 0,
            "langfuse_failed": 0,
        }

    def preflight(self) -> bool:
        """Ensure ENV=prod and Langfuse creds are wired before touching anything."""
        if os.getenv("ENV") != "prod":
            logger.error(
                "ENV is not 'prod' — refusing to run backfill. "
                "Set ENV=prod explicitly if you really mean it.",
                env=os.getenv("ENV"),
            )
            return False
        if not self.sync.is_active(): 
            logger.error(
                "LangfuseTemplateSync.is_active() is False — check "
                "LANGFUSE_SECRET_KEY / LANGFUSE_PUBLIC_KEY / LANGFUSE_BASE_URL."
            )
            return False
        return True

    def fetch_templates(self) -> List[Dict[str, Any]]:
        logger.info("Scanning ekascribe_template…")
        items = self.helper.scan_table()
        logger.info("Scan complete", row_count=len(items))
        return items

    def is_eligible(self, t: Dict[str, Any]) -> bool:
        if t.get("archived") is True:
            self.stats["skipped_archived"] += 1
            return False
        if self.wid_filter and t.get("wid") != self.wid_filter:
            self.stats["skipped_wid_filter"] += 1
            return False
        desc = t.get("desc") or ""
        section_ids = t.get("section_ids") or []
        if not desc.strip():
            self.stats["skipped_no_desc"] += 1
            return False
        if section_ids:
            self.stats["skipped_section_based"] += 1
            return False
        if t.get("langfuse_prompt_name") and not self.include_synced:
            self.stats["skipped_already_synced"] += 1
            return False
        return True

    def sync_one(self, t: Dict[str, Any]) -> None:
        template_id = t.get("id")
        title = t.get("title", "")
        desc = t.get("desc", "")
        wid = t.get("wid", "")
        existing_name = t.get("langfuse_prompt_name")

        if not template_id:
            logger.warning("Row missing id — skipping", row=t)
            return

        if self.dry_run:
            target_name = existing_name or self.sync.build_prompt_name(title, template_id)
            logger.info(
                "[DRY RUN] would sync",
                template_id=template_id,
                wid=wid,
                title=title,
                target_langfuse_name=target_name,
                reused_existing_name=bool(existing_name),
            )
            self.stats["synced"] += 1
            return

        try:
            if existing_name:
                self.sync.update(
                    langfuse_prompt_name=existing_name,
                    template_id=template_id,
                    template_name=title,
                    desc=desc,
                    wid=wid,
                )
                name = existing_name
            else:
                name = self.sync.create(
                    template_id=template_id,
                    template_name=title,
                    desc=desc,
                    wid=wid,
                )
        except Exception as e:
            self.stats["langfuse_failed"] += 1
            logger.error(
                "Langfuse push failed",
                template_id=template_id,
                wid=wid,
                error=str(e),
                exc_info=True,
            )
            return

        # Always write back the name (even if it was already there) — keeps the
        # row authoritative and lets --include-synced repair drift.
        try:
            self.helper.update_item(
                key_dict={"id": template_id},
                update_dict={"langfuse_prompt_name": name},
            )
            self.stats["synced"] += 1
            logger.info(
                "synced",
                template_id=template_id,
                wid=wid,
                langfuse_prompt_name=name,
            )
        except Exception as e:
            self.stats["writeback_failed"] += 1
            logger.error(
                "Dynamo writeback failed AFTER Langfuse push — "
                "rerun the script and it will reuse the existing version "
                "(idempotent by template id)",
                template_id=template_id,
                wid=wid,
                langfuse_prompt_name=name,
                error=str(e),
                exc_info=True,
            )

    def run(self) -> None:
        if not self.preflight():
            sys.exit(2)

        templates = self.fetch_templates()
        self.stats["scanned"] = len(templates)

        eligible = [t for t in templates if self.is_eligible(t)]
        self.stats["eligible"] = len(eligible)

        if self.limit is not None:
            eligible = eligible[: self.limit]
            logger.info("limit applied", processing=len(eligible), total_eligible=self.stats["eligible"])

        logger.info(
            "starting sync",
            eligible=self.stats["eligible"],
            processing=len(eligible),
            dry_run=self.dry_run,
            include_synced=self.include_synced,
        )

        for idx, t in enumerate(eligible, start=1):
            self.sync_one(t)
            if idx % 25 == 0:
                logger.info("progress", processed=idx, total=len(eligible))
            # Gentle throttle so we don't spike the Langfuse API.
            time.sleep(0.05)

        self.print_summary()

    def print_summary(self) -> None:
        logger.info("=" * 70)
        logger.info("BACKFILL SUMMARY")
        logger.info("=" * 70)
        for k, v in self.stats.items():
            logger.info(f"{k:<28} {v}")
        logger.info("=" * 70)
        if self.dry_run:
            logger.info("DRY RUN — no Langfuse or Dynamo writes happened.")
        if self.stats["langfuse_failed"] or self.stats["writeback_failed"]:
            logger.warning("Some rows failed — see logs above. Re-run is safe.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log what would be synced without calling Langfuse or writing to Dynamo.",
    )
    parser.add_argument(
        "--include-synced",
        action="store_true",
        help="Re-push rows that already have langfuse_prompt_name set (creates a new version).",
    )
    parser.add_argument(
        "--wid",
        default=None,
        help="Only process templates with this wid (e.g. DEFAULT, or a specific business id).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N eligible rows. Useful for a smoke run.",
    )
    args = parser.parse_args()

    backfill = TemplateLangfuseBackfill(
        dry_run=args.dry_run,
        include_synced=args.include_synced,
        wid_filter=args.wid,
        limit=args.limit,
    )
    try:
        backfill.run()
    except KeyboardInterrupt:
        logger.warning("interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error("unexpected error", error=str(e), exc_info=True)
        sys.exit(1)

    if backfill.stats["langfuse_failed"] or backfill.stats["writeback_failed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
