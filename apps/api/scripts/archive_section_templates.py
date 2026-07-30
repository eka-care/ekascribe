#!/usr/bin/env python3
"""
Archive section-based EkaScribe templates and prune them from doctor configs.

  1. Scans `ekascribe_template`. For every template with a NON-EMPTY
     section-ids field, sets `archived = True` (does NOT delete).
  2. Collects the IDs of all those templates.
  3. Scans `ekascribe_config`. Removes any of those archived template IDs
     from each config's `my_templates` list.

Safe by default: DRY-RUN unless --apply is passed. Idempotent.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

import boto3

TEMPLATE_TABLE = os.environ.get("TEMPLATE_TABLE", "ekascribe_template")
CONFIG_TABLE = os.environ.get("CONFIG_TABLE", "ekascribe_config")
SECTION_IDS_FIELD = os.environ.get("SECTION_IDS_FIELD", "section_ids")
ARCHIVED_FIELD = "archived"
MY_TEMPLATES_FIELD = "my_templates"

log = logging.getLogger("archive_section_templates")


def _is_non_empty(value) -> bool:
    if value is None:
        return False
    if hasattr(value, "__len__"):
        return len(value) > 0
    return bool(value)


def _norm(value) -> str:
    return str(value)


def _key_attr_names(table) -> list[str]:
    return [k["AttributeName"] for k in table.key_schema]


def _hash_key_name(table) -> str:
    for k in table.key_schema:
        if k["KeyType"] == "HASH":
            return k["AttributeName"]
    raise RuntimeError(f"No HASH key found on {table.name}")


def iter_scan(table, **kwargs):
    response = table.scan(**kwargs)
    yield from response["Items"]
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"], **kwargs)
        yield from response["Items"]


def archive_templates(table, *, dry_run: bool) -> set[str]:
    key_names = _key_attr_names(table)
    hash_key = _hash_key_name(table)
    archived_ids: set[str] = set()
    scanned = 0
    newly_archived = 0
    already_archived = 0

    for item in iter_scan(table):
        scanned += 1
        if not _is_non_empty(item.get(SECTION_IDS_FIELD)):
            continue
        template_id = item[hash_key]
        archived_ids.add(_norm(template_id))
        if item.get(ARCHIVED_FIELD) is True:
            already_archived += 1
            continue
        newly_archived += 1
        key = {k: item[k] for k in key_names}
        if dry_run:
            log.info("[DRY-RUN] would archive template %s", template_id)
        else:
            table.update_item(
                Key=key,
                UpdateExpression="SET #a = :true",
                ExpressionAttributeNames={"#a": ARCHIVED_FIELD},
                ExpressionAttributeValues={":true": True},
            )
            log.info("archived template %s", template_id)

    log.info(
        "Templates: scanned=%d  with_section_ids=%d  (newly_archived=%d, already_archived=%d)",
        scanned, len(archived_ids), newly_archived, already_archived,
    )
    return archived_ids


def prune_configs(table, archived_ids: set[str], *, dry_run: bool) -> tuple[int, int]:
    key_names = _key_attr_names(table)
    scanned = 0
    modified = 0
    total_removed = 0
    warned_objects = False

    for item in iter_scan(table):
        scanned += 1
        my_templates = item.get(MY_TEMPLATES_FIELD)
        if not my_templates:
            continue
        if not warned_objects and any(isinstance(t, dict) for t in my_templates):
            log.warning(
                "my_templates appears to contain objects, not plain ids. "
                "Adjust the filter predicate before applying!"
            )
            warned_objects = True
        kept = [t for t in my_templates if _norm(t) not in archived_ids]
        removed = len(my_templates) - len(kept)
        if removed == 0:
            continue
        modified += 1
        total_removed += removed
        key = {k: item[k] for k in key_names}
        if dry_run:
            log.info("[DRY-RUN] would remove %d id(s) from config %s", removed, key)
        else:
            table.update_item(
                Key=key,
                UpdateExpression="SET #m = :m",
                ExpressionAttributeNames={"#m": MY_TEMPLATES_FIELD},
                ExpressionAttributeValues={":m": kept},
            )
            log.info("updated config %s (removed %d)", key, removed)

    log.info("Configs: scanned=%d  modified=%d  ids_removed=%d", scanned, modified, total_removed)
    return modified, total_removed


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="Actually write changes (default is dry-run).")
    p.add_argument("--yes", action="store_true", help="Skip the interactive confirmation prompt.")
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-south-1"))
    p.add_argument("--template-table", default=TEMPLATE_TABLE)
    p.add_argument("--config-table", default=CONFIG_TABLE)
    p.add_argument("--section-field", default=SECTION_IDS_FIELD)
    return p.parse_args(argv)


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args(argv)

    global SECTION_IDS_FIELD
    SECTION_IDS_FIELD = args.section_field

    dry_run = not args.apply
    mode = "DRY-RUN (no writes)" if dry_run else "APPLY (writing changes)"

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    template_table = dynamodb.Table(args.template_table)
    config_table = dynamodb.Table(args.config_table)

    account = "<unknown>"
    try:
        account = boto3.client("sts", region_name=args.region).get_caller_identity()["Account"]
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not resolve AWS account via STS: %s", exc)

    print("=" * 64)
    print(f" MODE          : {mode}")
    print(f" AWS account   : {account}")
    print(f" Region        : {args.region}")
    print(f" Template table: {args.template_table}")
    print(f" Config table  : {args.config_table}")
    print(f" Section field : {SECTION_IDS_FIELD}")
    print("=" * 64)

    if not dry_run and not args.yes and sys.stdin.isatty():
        confirm = input("This will write to the tables above. Type 'yes' to continue: ")
        if confirm.strip().lower() != "yes":
            log.info("Aborted by user.")
            return 1

    archived_ids = archive_templates(template_table, dry_run=dry_run)
    if not archived_ids:
        log.info("No templates with a non-empty %s found. Nothing to prune. Done.", SECTION_IDS_FIELD)
        return 0

    prune_configs(config_table, archived_ids, dry_run=dry_run)

    if dry_run:
        log.info("Dry-run complete. Re-run with --apply to write these changes.")
    else:
        log.info("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())