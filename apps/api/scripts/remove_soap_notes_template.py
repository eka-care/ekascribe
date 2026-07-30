#!/usr/bin/env python3
"""
Count how many doctors have the SOAP notes template in their my_templates
config, and (optionally) remove it from every config that references it.

This script:
1. Verifies the template ID exists in ekascribe_template (prints its title)
2. Scans ekascribe_config and finds every record whose my_templates list
   contains the SOAP notes template ID
3. Prints the count (workspace configs vs user configs)
4. With --apply, removes the ID from my_templates for all matched records

Usage:
    python scripts/remove_soap_notes_template.py              # count only (dry run)
    python scripts/remove_soap_notes_template.py --apply      # count + remove
    python scripts/remove_soap_notes_template.py --template-id <id>
"""
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import argparse
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List

from voice2rx.utils.dynamo_helper import DynamoHelper
from logs.custom_logger import get_logger

logger = get_logger(__name__)

TEMPLATE_TABLE = "ekascribe_template"
CONFIG_TABLE = "ekascribe_config"
SOAP_NOTES_TEMPLATE_ID = "19288d2f-81a9-46a6-b804-9651242a9b3e"
BACKUP_DIR = Path(__file__).parent / "backups"


def _json_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, set):
        return sorted(obj)
    return str(obj)


class SoapNotesTemplateRemoval:
    def __init__(self, template_id: str, apply_changes: bool):
        self.template_id = template_id
        self.apply_changes = True
        self.template_helper = DynamoHelper(TEMPLATE_TABLE)
        self.config_helper = DynamoHelper(CONFIG_TABLE)

        self.matched_configs: List[Dict[str, Any]] = []
        self.stats = {
            "configs_scanned": 0,
            "configs_using_template": 0,
            "workspace_configs": 0,
            "user_configs": 0,
            "configs_updated": 0,
            "errors": 0,
        }

    def verify_template(self) -> None:
        template = self.template_helper.get_item(key_dict={"id": self.template_id})
        if template:
            logger.info(
                f"Template found: id={self.template_id}, "
                f"title={template.get('title') or template.get('name')}"
            )
        else:
            logger.warning(
                f"Template id={self.template_id} not found in {TEMPLATE_TABLE} — "
                f"continuing anyway (it may have been deleted already)"
            )

    def find_configs_using_template(self) -> None:
        logger.info(f"Scanning {CONFIG_TABLE} for my_templates containing {self.template_id} ...")
        all_configs = self.config_helper.scan_table()
        self.stats["configs_scanned"] = len(all_configs)
        logger.info(f"Scanned {len(all_configs)} config records")

        for config in all_configs:
            my_templates = config.get("my_templates") or []
            if self.template_id not in my_templates:
                continue

            self.matched_configs.append(config)
            self.stats["configs_using_template"] += 1

            user_uuid = config.get("user_uuid", "")
            if user_uuid == "_":
                self.stats["workspace_configs"] += 1
                config_type = "workspace"
            else:
                self.stats["user_configs"] += 1
                config_type = "user"

            logger.info(
                f"  [{config_type}] b_id={config.get('b_id')}, user_uuid={user_uuid}"
            )

    def backup_matched_configs(self) -> Path:
        """Dump the full pre-change records to a timestamped JSON file."""
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = BACKUP_DIR / f"ekascribe_config_backup_{self.template_id}_{timestamp}.json"

        payload = {
            "table": CONFIG_TABLE,
            "template_id": self.template_id,
            "backed_up_at": timestamp,
            "record_count": len(self.matched_configs),
            "records": self.matched_configs,
        }
        with open(backup_path, "w") as f:
            json.dump(payload, f, indent=2, default=_json_default)

        logger.info(f"Backed up {len(self.matched_configs)} config record(s) to {backup_path}")
        return backup_path

    def remove_template_from_configs(self) -> None:
        for config in self.matched_configs:
            b_id = config.get("b_id")
            user_uuid = config.get("user_uuid")
            cleaned = [tid for tid in config.get("my_templates", []) if tid != self.template_id]

            try:
                self.config_helper.update_item(
                    key_dict={"b_id": b_id, "user_uuid": user_uuid},
                    update_dict={"my_templates": cleaned},
                )
                self.stats["configs_updated"] += 1
                logger.info(f"Removed template from b_id={b_id}, user_uuid={user_uuid}")
            except Exception as e:
                self.stats["errors"] += 1
                logger.error(
                    f"Error updating config (b_id={b_id}, user_uuid={user_uuid}): {e}",
                    exc_info=True,
                )

    def print_summary(self) -> None:
        logger.info("\n" + "=" * 70)
        logger.info("SUMMARY")
        logger.info("=" * 70)
        logger.info(f"Template ID:                     {self.template_id}")
        logger.info(f"Config records scanned:          {self.stats['configs_scanned']}")
        logger.info(f"Configs using this template:     {self.stats['configs_using_template']}")
        logger.info(f"  - workspace configs:           {self.stats['workspace_configs']}")
        logger.info(f"  - user (doctor) configs:       {self.stats['user_configs']}")

        if self.apply_changes:
            logger.info(f"Configs updated:                 {self.stats['configs_updated']}")
            logger.info(f"Errors:                          {self.stats['errors']}")
        else:
            logger.info("\nDRY RUN — no changes were made.")
            logger.info("Run with --apply to remove the template from these configs.")
        logger.info("=" * 70)

    def run(self) -> None:
        self.verify_template()
        self.find_configs_using_template()

        if self.apply_changes and self.matched_configs:
            self.backup_matched_configs()
            self.remove_template_from_configs()

        self.print_summary()


def main():
    parser = argparse.ArgumentParser(
        description="Count and remove the SOAP notes template from ekascribe_config my_templates"
    )
    parser.add_argument(
        "--template-id",
        default=SOAP_NOTES_TEMPLATE_ID,
        help=f"Template ID to look for (default: {SOAP_NOTES_TEMPLATE_ID})",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually remove the template ID from matched configs (default is dry-run/count only)",
    )
    args = parser.parse_args()

    job = SoapNotesTemplateRemoval(template_id=args.template_id, apply_changes=args.apply)

    try:
        job.run()
        if job.stats["errors"] > 0:
            sys.exit(1)
    except KeyboardInterrupt:
        logger.warning("\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
