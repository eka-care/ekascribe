"""
Transaction Background Service - Background Task Operations

This service handles asynchronous background tasks related to transactions:
- Copying transcripts to new storage location
- Copying template results to new storage location
- Database updates for file migrations
"""

import warnings
from typing import Dict, Any
from logs.custom_logger import get_logger
from voice2rx.model_orms import TxnTemplateResultsORM
from voice2rx.services.templates.template_result_file_service import TemplateResultFileService
from voice2rx.utils.time_utils import get_current_epoch_timestamp
from typing_extensions import deprecated

logger = get_logger(__name__)


class TransactionBackgroundService:
    """Service for handling transaction-related background tasks."""

    def __init__(
        self,
        template_file_service: TemplateResultFileService = None,
        txn_template_results_repo: TxnTemplateResultsORM = None
    ):
        """
        Initialize the background service.
        
        Args:
            template_file_service: Template result file service instance
            txn_template_results_repo: Transaction template results ORM instance
        """
        self.template_file_service = template_file_service or TemplateResultFileService()
        self.txn_template_results_repo = txn_template_results_repo or TxnTemplateResultsORM()
        logger.info("TransactionBackgroundService initialized")
    
    @deprecated("Use populate_documents(migrate=True) instead (since 1.0.0)")
    def copy_transcript_to_new_location(self, s3_url: str, txn_id: str, b_id: str) -> None:
        """
        Background task to copy transcript from legacy location to new location.
        Also creates entry in ekascribe_template_result table with template_id="transcript".

        .. deprecated::
            Use populate_documents(migrate=True) instead.

        Args:
            s3_url: Transaction S3 URL
            txn_id: Transaction ID
            b_id: Business ID

        Raises:
            Exception: If transcript copy fails or DB update fails
        """
        warnings.warn(
            "copy_transcript_to_new_location is deprecated. Use populate_documents(migrate=True) instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        logger.info(
            "BACKGROUND TASK: Starting transcript copy to new location",
            txn_id=txn_id,
            b_id=b_id
        )
        
        # copy transcript from legacy location to new location.
        # template_results/transcripts/ folder.
        new_file_path = self.template_file_service.copy_transcript_from_legacy(
            s3_url, 
            txn_id
        )
        
        # same entry need to be created in template_results table. with s3 location.
        template_result_data = {
            "txn_id": txn_id,
            "template_id": "transcript",
            "status": "success",
            "template_type": "transcript",
            "template_result_s3_url": new_file_path,
            "processed_at": get_current_epoch_timestamp(),
        }
        
        self.txn_template_results_repo.upsert_template_result(template_result_data)
        
        logger.info(
            "BACKGROUND TASK: Transcript copied and DB updated successfully",
            txn_id=txn_id,
            b_id=b_id,
            new_file_path=new_file_path,
            severity="medium",
        )
    
    @deprecated("Use populate_documents(migrate=True) instead (since 1.0.0)")
    def copy_templates_to_new_location(
        self,
        s3_url: str,
        txn_id: str,
        b_id: str,
        output_template_result: Dict[str, Any]
    ) -> None:
        """
        Background task to copy template results from output.json to individual template files.
        Updates ekascribe_template_result table with new file paths.

        .. deprecated::
            Use populate_documents() instead.

        Continues processing all templates even if some fail. Logs errors for failed templates.

        Args:
            s3_url: Transaction S3 URL
            txn_id: Transaction ID
            b_id: Business ID
            output_template_result: Dictionary of template results with status, errors, warnings
        """
        warnings.warn(
            "copy_templates_to_new_location is deprecated. Use populate_documents() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        logger.info(
            "BACKGROUND TASK: Starting templates copy to new location",
            txn_id=txn_id,
            b_id=b_id,
            template_count=len(output_template_result)
        )
        
        successful_copies = 0
        failed_copies = 0
        errors = []
        
        for template_id in output_template_result:
            try:
                template_info = output_template_result.get(template_id, {})
                template_status = template_info.get("status", "success")
                new_file_path = None

                # for failed templates, structured output can be missing in output.json.
                # skip copy and only persist failure status in DB.
                if template_status == "success":
                    new_file_path = self.template_file_service.copy_template_from_output_json(
                        s3_url,
                        template_id,
                        txn_id,
                        output_template_result
                    )

                update_data = {
                    "status": template_status,
                    "processed_at": get_current_epoch_timestamp(),
                }
                if new_file_path:
                    update_data["template_result_s3_url"] = new_file_path

                self.txn_template_results_repo.update_template_result(
                    txn_id,
                    template_id,
                    update_data
                )

                if template_status == "success":
                    successful_copies += 1
                    logger.info(
                        "BACKGROUND TASK: Template copied and DB updated successfully",
                        txn_id=txn_id,
                        template_id=template_id,
                        new_file_path=new_file_path,
                        status=template_status,
                        severity="medium",
                    )
                else:
                    failed_copies += 1
                    error_msg = f"Template {template_id}: status marked as failure in output_template_result"
                    errors.append(error_msg)
                    logger.warning(
                        "BACKGROUND TASK: Template marked as failure; skipped copy and updated DB status",
                        txn_id=txn_id,
                        template_id=template_id,
                        status=template_status,
                        severity="medium",
                    )
            
            except Exception as e:
                failed_copies += 1
                error_msg = f"Template {template_id}: {str(e)}"
                errors.append(error_msg)
                logger.error(
                    "BACKGROUND TASK: Error copying individual template",
                    txn_id=txn_id,
                    template_id=template_id,
                    error=str(e),
                    exc_info=True,
                    severity="critical",
                )
        
        logger.info(
            "BACKGROUND TASK: Templates copy completed",
            txn_id=txn_id,
            b_id=b_id,
            successful=successful_copies,
            failed=failed_copies,
            severity="medium",
        )
        
        # raise exception if all templates failed
        if failed_copies > 0 and successful_copies == 0:
            raise Exception(f"Failed to copy all templates: {'; '.join(errors)}")
        
        # log warning if some templates failed but continue
        if failed_copies > 0:
            logger.warning(
                "BACKGROUND TASK: Some templates failed to copy",
                txn_id=txn_id,
                b_id=b_id,
                failed_count=failed_copies,
                errors=errors,
                severity="medium",
            )
