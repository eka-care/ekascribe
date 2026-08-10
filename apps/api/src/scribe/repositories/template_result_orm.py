"""
Template Result ORM - Data Access Layer

This ORM handles all database and storage operations for template results:
- DynamoDB operations for templates and sections
- S3 operations for transcript and output files
- Transaction data access
"""

from typing import Dict, List, Optional, Any, Tuple
from scribe.core.custom_logger import get_logger
from scribe.repositories.dynamo_helper import DynamoHelper
from scribe.repositories.s3_service import download_s3_file, upload_file_to_s3
import os

logger = get_logger(__name__)

class TemplateResultORM:
    def __init__(self):
        """Initialize ORM with database helpers."""
        try:
            self.template_db = DynamoHelper("ekascribe_template")
            self.section_db = DynamoHelper("ekascribe_template_section")
            self.s3_vaded_bucket_name = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")

            logger.info("TemplateResultORM initialized successfully")
        except Exception as e:
            logger.error(
                "Failed to initialize TemplateResultORM",
                error=str(e),
                severity="medium",
            )
            raise ConnectionError(f"Failed to initialize TemplateResultORM: {e}")

    def get_sections_by_ids(
        self, section_ids: List[str]
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get multiple sections by IDs from DynamoDB.
        Args:
            section_ids: List of section IDs
        Returns:
            List of section data or None if not found
        """
        try:
            if not section_ids:
                return []
            response = self.section_db.query_multiple_items_batch(
                section_ids, "id"
            )

            if response:
                logger.info(
                    "Sections retrieved",
                    count=len(response),
                    section_ids=section_ids
                )
                return response
            else:
                logger.warning("No sections found", section_ids=section_ids, severity="medium")
                return None
        except Exception as e:
            logger.error(
                "Error fetching sections",
                section_ids=section_ids,
                error=str(e),
                severity="medium",
            )
            raise

    def download_output_file(
        self, file_path: str, txn_id: str
    ) -> Optional[Dict[str, Any]]:  
        return download_s3_file(
            self.s3_vaded_bucket_name, file_path, "output.json", txn_id
        )

    def download_transcript_file(
        self, file_path: str, txn_id: str
    ) -> Optional[Dict[str, Any]]:
        return download_s3_file(
            self.s3_vaded_bucket_name, file_path, "transcript.json", txn_id
        )

    def upload_output_file(
        self, file_path: str, output_file: Dict[str, Any], txn_id: str
    ) -> bool:
        try:
            success = upload_file_to_s3(
                self.s3_vaded_bucket_name,
                file_path,
                output_file,
                txn_id
            )

            match success:
                case True:
                    logger.info(
                        "Output file uploaded to S3",
                        txn_id=txn_id,
                        file_path=file_path,
                        severity="medium",
                    )
                case False:
                    logger.error(
                        "Failed to upload output file to S3",
                        txn_id=txn_id,
                        file_path=file_path,
                        severity="critical",
                    )
            
            return success
        except Exception as e:
            logger.error(
                "Error uploading output file to S3",
                txn_id=txn_id,
                file_path=file_path,
                error=str(e),
                severity="critical",
            )
            return False


    def get_output_file_path(self, transaction_data: Dict[str, Any]) -> Tuple[str, str]:
        folder_name = transaction_data.get("s3_url", "").removeprefix(
            f"s3://{self.s3_vaded_bucket_name}/"
        )
        
        if folder_name.endswith("/"):
            file_path = folder_name + "output.json"
        else:
            file_path = folder_name + "/output.json"
        return folder_name, file_path


    def get_transcript_file_path(
        self, transaction_data: Dict[str, Any]
    ) -> Tuple[str, str]:
        folder_name = transaction_data.get("s3_url", "").removeprefix(
            f"s3://{self.s3_vaded_bucket_name}/"
        )
        file_path = folder_name + "/logs/transcript.json"
        return folder_name, file_path

