#!/usr/bin/env python3
"""
Script to clean up archived template IDs from ekascribe_config table.

This script:
1. Gets all archived template IDs from ekascribe_template table
2. Scans ekascribe_config table (both workspace and user configs)
3. Removes archived template IDs from my_templates field
4. Updates the records in DynamoDB

Usage:
    python scripts/cleanup_archived_templates.py [--dry-run]
"""
import sys
import os
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import argparse
import logging
from typing import List, Dict, Any, Set
from voice2rx.utils.dynamo_helper import DynamoHelper
from logs.custom_logger import get_logger

logger = get_logger(__name__)

TEMPLATE_TABLE = "ekascribe_template"
CONFIG_TABLE = "ekascribe_config"


class ArchiveTemplateCleanup:
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.template_helper = DynamoHelper(TEMPLATE_TABLE)
        self.config_helper = DynamoHelper(CONFIG_TABLE)
    
        self.stats = {
            "archived_templates_found": 0,
            "configs_scanned": 0,
            "configs_with_archived_templates": 0,
            "configs_updated": 0,
            "templates_removed": 0,
            "errors": 0
        }
    
    def get_archived_template_ids(self) -> Set[str]:
        logger.info("Fetching archived templates from DynamoDB...")
        try:    
            archived_templates = self.template_helper.scan_by_filter(
                filter_dict={"archived": True}
            )
            
            archived_ids = {template.get("id") for template in archived_templates if template.get("id")}
            
            self.stats["archived_templates_found"] = len(archived_ids)
            logger.info(f"Found {len(archived_ids)} archived templates")

            if archived_ids:
                logger.debug(f"Archived template IDs: {archived_ids}")
            
            return archived_ids
            
        except Exception as e:
            logger.error(f"Error fetching archived templates: {str(e)}", exc_info=True)
            self.stats["errors"] += 1
            return set()
    
    def scan_and_cleanup_configs(self, archived_template_ids: Set[str]) -> None:
        if not archived_template_ids:
            logger.warning("No archived templates to clean up")
            return
        
        logger.info(f"Scanning {CONFIG_TABLE} table for configs with archived templates...")

        try:
            all_configs = self.config_helper.scan_table()
            
            self.stats["configs_scanned"] = len(all_configs)
            logger.info(f"Scanned {len(all_configs)} config records")
            
            for config in all_configs:
                self._process_config(config, archived_template_ids)
            
        except Exception as e:
            logger.error(f"Error scanning configs: {str(e)}", exc_info=True)
            self.stats["errors"] += 1
    
    def _process_config(self, config: Dict[str, Any], archived_template_ids: Set[str]) -> None:
        b_id = config.get("b_id", "")
        user_uuid = config.get("user_uuid", "")
        my_templates = config.get("my_templates", [])
        
        if not my_templates:
            return
        
        original_count = len(my_templates)
        archived_in_config = [tid for tid in my_templates if tid in archived_template_ids]
        
        if not archived_in_config:
            return

        self.stats["configs_with_archived_templates"] += 1
        config_type = "workspace" if user_uuid == "_" else "user"
        
        logger.info(
            f"Found {len(archived_in_config)} archived template(s) in {config_type} config: "
            f"b_id={b_id}, user_uuid={user_uuid}"
        )
        logger.debug(f"   Archived templates in config: {archived_in_config}")
        
        cleaned_templates = [tid for tid in my_templates if tid not in archived_template_ids]
        removed_count = original_count - len(cleaned_templates)
        
        if self.dry_run:
            logger.info(
                f"[DRY RUN] Would remove {removed_count} template(s) from "
                f"{config_type} config (b_id={b_id}, user_uuid={user_uuid})"
            )
            self.stats["templates_removed"] += removed_count
        else:
            success = self._update_config(b_id, user_uuid, cleaned_templates)
            
            if success:
                self.stats["configs_updated"] += 1
                self.stats["templates_removed"] += removed_count
                logger.info(
                    f"Removed {removed_count} archived template(s) from "
                    f"{config_type} config (b_id={b_id}, user_uuid={user_uuid})"
                )
            else:
                self.stats["errors"] += 1
    
    def _update_config(self, b_id: str, user_uuid: str, cleaned_templates: List[str]) -> bool:
        try:
            key_dict = {"b_id": b_id, "user_uuid": user_uuid}
            update_dict = {"my_templates": cleaned_templates}
            
            self.config_helper.update_item(
                key_dict=key_dict,
                update_dict=update_dict
            )
            
            return True
            
        except Exception as e:
            logger.error(
                f"Error updating config (b_id={b_id}, user_uuid={user_uuid}): {str(e)}",
                exc_info=True
            )
            return False
    
    def print_summary(self) -> None:
        logger.info("\n" + "=" * 70)
        logger.info("CLEANUP SUMMARY")
        logger.info("=" * 70)
        logger.info(f"Archived templates found:          {self.stats['archived_templates_found']}")
        logger.info(f"Config records scanned:            {self.stats['configs_scanned']}")
        logger.info(f"Configs with archived templates:   {self.stats['configs_with_archived_templates']}")
        
        if self.dry_run:
            logger.info(f"Configs that would be updated:     {self.stats['configs_with_archived_templates']}")
            logger.info(f"Templates that would be removed:   {self.stats['templates_removed']}")
        else:
            logger.info(f"Configs updated:                   {self.stats['configs_updated']}")
            logger.info(f"Template references removed:       {self.stats['templates_removed']}")
        
        logger.info(f"Errors encountered:                {self.stats['errors']}")
        logger.info("=" * 70)
        
        if self.dry_run:
            logger.info("\nThis was a DRY RUN - no changes were made to the database")
            logger.info("Run without --dry-run to apply changes\n")
        else:
            logger.info("\nCleanup completed successfully!\n")


def main():
    cleanup = ArchiveTemplateCleanup(dry_run=False)
    
    try:
        archived_template_ids = cleanup.get_archived_template_ids()
        if not archived_template_ids:
            logger.warning("No archived templates found. Nothing to clean up.")
            return
        
        cleanup.scan_and_cleanup_configs(archived_template_ids)
        
        cleanup.print_summary()
        
        if cleanup.stats["errors"] > 0:
            sys.exit(1)
        
    except KeyboardInterrupt:
        logger.warning("\nCleanup interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

