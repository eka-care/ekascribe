"""
Transaction Template Results ORM - Data Access Layer

This ORM handles all database operations for the txn_template_results table.
Table stores template processing status and results for each transaction.

Table Structure:
- txn_id (partition key): Transaction ID
- template_id (sort key): Template ID
- prompt_s3_url: S3 URL where prompt is stored
- status: success, failure, in-progress
- template_type: visual, integration
- template_result_s3_url: S3 URL where output.json is stored
- created_at: Epoch timestamp when record was created
- updated_at: Epoch timestamp when record was last updated
"""

import os
import warnings
from typing import Dict, List, Optional, Any
from scribe.core.custom_logger import get_logger
from scribe.core.exceptions import DuplicateEntryException
from scribe.repositories.base_orm import BaseORM
from scribe.core.time_utils import get_current_epoch_timestamp, get_current_utc_timestamp

logger = get_logger(__name__)


class TxnTemplateResultsORM(BaseORM):
    """ORM for transaction template results table operations."""

    def __init__(self):
        """Initialize template results ORM."""
        table_name = os.getenv("TXN_TEMPLATE_RESULTS_TABLE", "ekascribe_template_result")
        super().__init__(table_name=table_name)
        logger.info(
            f"TxnTemplateResultsORM initialized with table: {table_name}"
        )

    def create_template_result(
        self,
        template_result_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a new template result record.

        .. deprecated::
            Use EkascribeDocumentORM.create_document() instead.

        Args:
            txn_id: Transaction ID
            template_id: Template ID
            template_type: Type of template (visual, integration)
            status: Processing status (default: in-progress)
            prompt_s3_url: Optional S3 URL for prompt
            template_result_s3_url: Optional S3 URL for result

        Returns:
            Created record dict or error dict
        """
        warnings.warn(
            "create_template_result is deprecated. Use EkascribeDocumentORM.create_document() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        try:
            txn_id = template_result_data["txn_id"]
            template_id = template_result_data["template_id"]

            current_time = get_current_epoch_timestamp()
            template_result_data["created_at"] = current_time
            template_result_data["updated_at"] = current_time

            result = self.insert_if_not_exists(
                item=template_result_data,
                partition_key="txn_id",
                partition_value=template_result_data["txn_id"],
                sort_key="template_id",
                sort_value=template_result_data["template_id"],
            )

            if not result.get("success"):
                logger.warning(
                    "Template result already exists",
                    txn_id=txn_id,
                    template_id=template_id,
                    severity="medium",
                )
                if result.get("code") == "duplicate_entry":
                    raise DuplicateEntryException(
                        f"Template result already exists for txn_id {txn_id} and template_id {template_id}"
                    )
                raise result.get("error")

        except Exception as e:
            logger.error(
                "Error creating template result",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise e

    def upsert_template_result(
        self,
        template_result_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a template result if it does not exist, or update it if it does.

        .. deprecated::
            Use EkascribeDocumentORM.create_document() + update_document() instead.

        Args:
            template_result_data: Dictionary containing the template result data.

        Returns:
            The created or updated record dictionary.
        """
        warnings.warn(
            "upsert_template_result is deprecated. Use EkascribeDocumentORM.create_document() + update_document() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        txn_id = template_result_data["txn_id"]
        template_id = template_result_data["template_id"]
        try:
            existing = self.get_template_result(txn_id, template_id)
            current_time_epoch = get_current_epoch_timestamp()
            current_time_utc = get_current_utc_timestamp()
            if not existing:
                template_result_data["created_at"] = current_time_epoch
                template_result_data["updated_at"] = current_time_utc
                insert_result = self.insert_if_not_exists(
                    item=template_result_data,
                    partition_key="txn_id",
                    partition_value=txn_id,
                    sort_key="template_id",
                    sort_value=template_id,
                )
                if not insert_result.get("success"):
                    logger.warning(
                        "Upsert could not create template result",
                        txn_id=txn_id,
                        template_id=template_id,
                        severity="medium",
                    )
                    if insert_result.get("code") == "duplicate_entry":
                        raise DuplicateEntryException(
                            f"Template result already exists for txn_id {txn_id} and template_id {template_id}"
                        )
                    raise insert_result.get("error")
                logger.info(
                    "Upsert created new template result",
                    txn_id=txn_id,
                    template_id=template_id,
                    severity="medium",
                )
                return template_result_data
            else:
                update_data = template_result_data.copy()
                update_data.pop("txn_id", None)
                update_data.pop("template_id", None)
                # update_data["updated_at"] = current_time
                updated_record = self.update_template_result(
                    txn_id=txn_id,
                    template_id=template_id,
                    update_data=update_data,
                )
                logger.info(
                    "Upsert updated existing template result",
                    txn_id=txn_id,
                    template_id=template_id,
                    severity="medium",
                )
                return updated_record

        except Exception as e:
            logger.error(
                "Error in upsert_template_result",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise e

    def get_template_result(
        self, txn_id: str, template_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a template result by txn_id and template_id.
        Args:
            txn_id: Transaction ID
            template_id: Template ID
        Returns:
            Template result dict or None if not found
        """
        try:
            key = {
                "txn_id": txn_id,
                "template_id": template_id,
            }
            result = self.get(key=key)
            if result:
                logger.info(
                    "Template result retrieved",
                    txn_id=txn_id,
                    template_id=template_id,
                    status=result.get("status"),
                )
            else:
                logger.debug(
                    "Template result not found",
                    txn_id=txn_id,
                    template_id=template_id,
                )
            return result
        
        except Exception as e:
            logger.error(
                "Error getting template result",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise e

    def get_all_template_results(self, txn_id: str) -> List[Dict[str, Any]]:
        """
        Get all template results for a transaction.
        Args:
            txn_id: Transaction ID
        Returns:
            List of template result dicts
        """
        try:
            response = self.table.query(
                KeyConditionExpression="txn_id = :txn_id",
                ExpressionAttributeValues={":txn_id": txn_id},
            )

            items = response.get("Items", [])
            return items

        except Exception as e:
            logger.error(
                "Error getting template results",
                txn_id=txn_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return []

    def update_template_result(
        self,
        txn_id: str,
        template_id: str,
        update_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Update a template result.

        .. deprecated::
            Use EkascribeDocumentORM.update_document() instead.

        Args:
            txn_id: Transaction ID
            template_id: Template ID
            update_data: Dictionary of attributes to update
        Returns:
            Updated item or None if not found
        """
        warnings.warn(
            "update_template_result is deprecated. Use EkascribeDocumentORM.update_document() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        try:
            key = {"txn_id": txn_id, "template_id": template_id}
            updated_item = self.update(key=key, update_data=update_data)
            logger.info(
                "Template result status updated",
                txn_id=txn_id,
                template_id=template_id,
                severity="medium",
            )
            return updated_item
        
        except Exception as e:
            logger.error(
                "Error updating template result status",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise e
