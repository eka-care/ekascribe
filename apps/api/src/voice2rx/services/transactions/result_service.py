"""
Result service for handling result/status API business logic.
"""

from http import HTTPStatus
from decimal import Decimal
import os
import time
import base64
import copy
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple, Any
import orjson
from logs.custom_logger import get_logger

from concurrent.futures import ThreadPoolExecutor, as_completed

from voice2rx.model_orms.audio_details_orm import AudioDetailsORM
from voice2rx.model_orms.transaction_orm import TransactionORM
from voice2rx.model_orms.transaction_template_orm import TxnTemplateResultsORM
from voice2rx.services.storage.s3_service import download_s3_file, upload_file_to_s3
from voice2rx.services.templates.format_adapter import TemplateFormatConverter
from voice2rx.services.templates.template_result_file_service import (
    TemplateResultFileService,
)
from voice2rx.services.templates.template_service import TemplateService
from voice2rx.choices import (
    VOICE2RX_PROCESSING_STATUS,
    VOICE2RX_TEMPLATE_STATUS,
    DocumentType,
    UserStatus,
)
from voice2rx.core.exceptions import (
    ActiveSessionException,
    RequestFailureException,
    ResourceNotFoundException,
    SystemFailureException,
    TransactionNotFoundException,
)
from voice2rx.services.transactions.transaction_service import TransactionService
from voice2rx.utils.fhir_utils import fetch_intermediate_fhir_result
from voice2rx.utils.time_utils import iso_to_epoch

logger = get_logger(__name__)

# Constants
MAX_POLL_DURATION_SECONDS = 15
POLL_INTERVAL_SECONDS = 0.5
PROCESSING_TIMEOUT_SECONDS = 120

# Template configurations
LEGACY_TEMPLATE_IDS = ["clinical_note_template", "transcript_template"]
INTEGRATION_TEMPLATE_IDS = [
    "fhir_template_v2",
    "eka_emr_template",
    "nic_template",
    "clinikk_template",
    "eka_emr_to_fhir_template",
]

OUTPUT_TEMPLATES = {
    "fhir_template_v2": {
        "template_id": "fhir_template_v2",
        "details": {
            "name": "V2DD template",
            "short_description": "Structured medical information in FHIR format",
            "long_description": "The FHIR Output template organizes extracted medical information into the FHIR standard format, enabling seamless integration with healthcare systems and applications that support FHIR.",
            "type": "json",
        },
    },
    "nic_template": {
        "template_id": "nic_template",
        "details": {
            "name": "NIC Template",
            "short_description": "NIC Template",
            "long_description": "NIC Template",
            "type": "json",
        },
    },
    "eka_emr_template": {
        "template_id": "eka_emr_template",
        "details": {
            "name": "Eka EMR Format",
            "short_description": "Structures medical conversations into doctor prescription format of Eka EMR",
            "long_description": "The Eka EMR template formats clinical conversations into structured doctor prescriptions, including chief complaints, diagnosis, medications, tests, and advice.",
            "type": "json",
        },
    },
    "clinical_note_template": {
        "template_id": "clinical_note_template",
        "details": {
            "name": "Clinical Notes",
            "short_description": "Formats clinical conversations into formatted and comprehensive medical notes",
            "long_description": "The Clinical Note template transforms medical conversations into structured clinical documentation with sections like history, examination, assessment, and plan in a format suitable for medical records.",
            "type": "markdown",
        },
    },
    "clinical_notes_template": {
        "template_id": "clinical_notes_template",
        "details": {
            "name": "Clinical Notes",
            "short_description": "Formats clinical conversations into formatted and comprehensive medical notes",
            "long_description": "The Clinical Note template transforms medical conversations into structured clinical documentation with sections like history, examination, assessment, and plan in a format suitable for medical records.",
            "type": "markdown",
        },
    },
    "transcript_template": {
        "template_id": "transcript_template",
        "details": {
            "name": "Transcription",
            "short_description": "Raw transcript of the conversations",
            "long_description": "The Transcript template provides the verbatim content of medical conversations without additional structuring or formatting.",
            "type": "text",
        },
    },
    "eka_emr_to_fhir_template": {
        "template_id": "eka_emr_to_fhir_template",
        "details": {
            "name": "Parchi to FHIR",
            "short_description": "Extracts information in Parchi format and then converts it to FHIR format",
            "long_description": "The Parchi to FHIR template extracts information in Parchi format and then converts it to FHIR format",
            "type": "json",
        },
    },
    "clinikk_template": {
        "template_id": "clinikk_template",
        "details": {
            "name": "Clinikk Template",
            "short_description": "Clinikk Template",
            "long_description": "Clinikk Template",
            "type": "json",
        },
    },
}


class ResultService:
    """ORM for result/status API operations."""

    def __init__(
        self,
        transaction_repo: Optional[TransactionORM] = None,
        template_results_repo: Optional[TxnTemplateResultsORM] = None,
        template_file_service: Optional[TemplateResultFileService] = None,
        audio_details_repo: Optional[AudioDetailsORM] = None,
    ):
        """
        Initialize result ORM.

        Args:
            transaction_repo: Transaction ORM instance
            template_results_repo: Template results ORM instance
            template_file_service: Template result file service instance
        """
        self.transaction_repo = transaction_repo or TransactionORM()
        self.template_results_repo = template_results_repo or TxnTemplateResultsORM()
        self.template_file_service = (
            template_file_service or TemplateResultFileService()
        )
        self.audio_details_repo = audio_details_repo or AudioDetailsORM()
        self.template_service = TemplateService
        self.vaded_bucket_name = os.getenv(
            "S3_VADED_BUCKET_NAME", "voice-records"
        )

    def get_chunk_transcript(
        self, txn_id: str, chunk_file_name: str, b_id: str
    ) -> Dict[str, Any]:
        """
        Get transcript of an audio chunk.

        Races three possible S3 outputs produced by different pipelines:
        "{base}_large.json", "{base}_parr.json", "{base}.json". The first
        one that becomes available wins. If multiple are already present
        at the same poll tick, ties are broken by priority
        _large > _parr > plain, since _large is the richest output.

        Also enriches the response with the chunk's audio_length and
        quality from the audio_details table.
        """
        transction_data = self.transaction_repo.get_transaction(txn_id, b_id)
        if not transction_data:
            raise TransactionNotFoundException(txn_id, b_id)

        s3_url = transction_data.get("s3_url", "")
        if not s3_url:
            raise ValueError("S3 URL is required")

        # normlize to the base chunk name without .json extension.
        base_name = chunk_file_name
        if base_name.endswith(".json"):
            base_name = base_name[: -len(".json")]

        folder_name = s3_url.removeprefix(f"s3://{self.vaded_bucket_name}/")

        # priority order is also the tie-break order when multiple variants
        # already exist at the same poll tick.
        variants = [
            ("large", f"{base_name}_large.json"),
            ("parr", f"{base_name}_parr.json"),
            ("default", f"{base_name}.json"),
        ]

        transcript, source_variant = self._race_transcript_variants(
            txn_id=txn_id,
            folder_name=folder_name,
            variants=variants,
            timeout_seconds=3,
        )

        if transcript is None:
            raise ResourceNotFoundException(
                f"Chunk transcript file for {base_name} not found"
            )

        audio_meta = self.audio_details_repo.get_chunk_audio_quality(
            txn_id=txn_id, b_id=b_id, chunk_name=base_name
        )
        if isinstance(transcript, dict):
            transcript["audio_length"] = (
                audio_meta.get("audio_length") if audio_meta else None
            )
            transcript["audio_quality"] = (
                audio_meta.get("quality") if audio_meta else None
            )

        return transcript

    def _race_transcript_variants(
        self,
        txn_id: str,
        folder_name: str,
        variants: List[Tuple[str, str]],
        timeout_seconds: float,
    ) -> Tuple[Optional[Any], Optional[str]]:
        """
        Poll S3 in parallel for multiple candidate file names and return
        the first one found. Each poll tick fans out all variants
        concurrently; the first non-None result wins. If more than one
        variant is present in the same tick, the earliest entry in
        `variants` wins (priority tie-break).

        Returns (content, variant_label) or (None, None) on timeout.
        """
        start_time = time.time()
        def _fetch(label: str, key: str):
            content = download_s3_file(
                self.vaded_bucket_name,
                f"{folder_name}/{key}",
                key,
                txn_id,
            )
            return label, content

        with ThreadPoolExecutor(max_workers=len(variants)) as executor:
            while time.time() - start_time < timeout_seconds:
                futures = {
                    executor.submit(_fetch, label, key): label
                    for label, key in variants
                }
                hits: Dict[str, Any] = {}
                for future in as_completed(futures):
                    try:
                        label, content = future.result()
                    except Exception as e:
                        continue
                    if content is not None:
                        hits[label] = content

                if hits:
                    for label, _ in variants:
                        if label in hits:
                            return hits[label], label

                time.sleep(0.1)

        return None, None

    def poll_for_transaction_completion(
        self, txn_id: str, b_id: str
    ) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
        """
        Poll transaction status until completion or timeout.
        Args:
            txn_id: Transaction ID
            b_id: Business ID

        Returns:
            Tuple of (transaction_data, output_file)

        Raises:
            TransactionNotFoundException: If transaction not found
        """
        start_time = time.time()
        output_file = None

        while time.time() - start_time < MAX_POLL_DURATION_SECONDS:
            transaction = self.transaction_repo.get_transaction(txn_id, b_id)
            if not transaction:
                raise TransactionNotFoundException(txn_id, b_id)

            processing_status = transaction.get(
                "processing_status", VOICE2RX_PROCESSING_STATUS.IN_PROGRESS.value
            )

            # check if user have committed the session or not
            if transaction.get("user_status", "") != UserStatus.COMMIT.value:
                # check if transaction is too old (> 2 hours)
                if self._is_transaction_too_old(transaction):
                    raise ActiveSessionException(
                        "Session is currently active. Please commit the session to start processing."
                    )
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            # check if the session is still in progress, keep polling.
            if processing_status == VOICE2RX_PROCESSING_STATUS.IN_PROGRESS.value:
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            # hack! if the processing status is system failure
            # call the commit and continue the polling.
            if processing_status == VOICE2RX_PROCESSING_STATUS.SYSTEM_FAILURE.value:
                transaction_service = TransactionService()
                transaction_service.commit_transaction(
                    txn_id, b_id, transaction.get("client_uploaded_files", []), []
                )

            # if system failure or cancelled, raise an exception.
            if processing_status in [
                # VOICE2RX_PROCESSING_STATUS.SYSTEM_FAILURE.value,
                VOICE2RX_PROCESSING_STATUS.CANCELLED.value,
            ]:
                error = transaction.get("processing_error", {})
                raise SystemFailureException(error, txn_id=txn_id, b_id=b_id)

            if processing_status == VOICE2RX_PROCESSING_STATUS.REQUEST_FAILURE.value:
                error = transaction.get("processing_error", {})
                raise RequestFailureException(error)

            # success - download output file
            processing_completed_status = self._get_processing_completed_status(
                processing_status, transaction, b_id, txn_id
            )
            if processing_completed_status:
                output_file = self.download_output_file(transaction, txn_id)
                if output_file:
                    break

                # continue polling if file not yet available, even after processing status is success.
                continue

        return transaction, output_file

    def poll_for_template_result(
        self, txn_id: str, b_id: str, template_id: str
    ) -> Tuple[Dict[str, Any], int]:
        """
        Poll for specific template result until completion or timeout (2 minutes).
        Args:
            txn_id: Transaction ID
            b_id: Business ID
            template_id: Template ID to poll for
        Returns:
            Tuple of (response_dict, status_code)

        Raises:
            ResourceNotFoundException: If template result not found
        """
        start_time = time.time()
        template_result = None

        logger.info(
            "RESULT SERVICE: Starting template polling",
            txn_id=txn_id,
            b_id=b_id,
            template_id=template_id,
        )

        transaction = self.transaction_repo.get_transaction(txn_id, b_id)
        if not transaction:
            raise TransactionNotFoundException(txn_id, b_id)

        while time.time() - start_time < MAX_POLL_DURATION_SECONDS:
            template_result = self.template_results_repo.get_template_result(
                txn_id, template_id
            )
            if not template_result:
                raise ResourceNotFoundException("template not found")

            status = template_result.get("status", "in-progress")
            commit_at = template_result.get("commit_at", "")
            try:
                process_start_ts = (
                    float(commit_at)
                    if isinstance(commit_at, (float, int))
                    else float(iso_to_epoch(commit_at))
                )
            except Exception as _:
                # assuming process started time 1 min behind the current time
                logger.error(
                    "RESULT SERVICE: Error parsing commit_at",
                    txn_id=txn_id,
                    b_id=b_id,
                    template_id=template_id,
                    commit_at=commit_at,
                    severity="medium",
                )
                process_start_ts = time.time() - 60
            elapsed_time = time.time() - process_start_ts
            if status == "in-progress" and elapsed_time > PROCESSING_TIMEOUT_SECONDS:
                logger.critical(
                    "RESULT SERVICE: Template result generation timeout",
                    txn_id=txn_id,
                    b_id=b_id,
                    template_id=template_id,
                    template_process_started_at=commit_at,
                    elapsed_time=elapsed_time,
                    severity="critical",
                )
                return (
                    self._build_template_response(
                        template_result, template_id, "results generation timeout"
                    ),
                    500,
                )

            if status in ["success", "failure", "partial_success"]:
                logger.info(
                    "RESULT SERVICE: Template result ready",
                    txn_id=txn_id,
                    b_id=b_id,
                    template_id=template_id,
                    status=status,
                    severity="medium",
                )

                # try reading individual template file first, fallback to output.json
                s3_url = transaction.get("s3_url", "")
                template_data = self.template_file_service.read_template_file(
                    s3_url=s3_url,
                    template_id=template_id,
                    txn_id=txn_id,
                    fallback_to_output_json=True,
                )

                if template_data:
                    response = self._build_template_response(
                        transaction,
                        template_id,
                        template_data.get("status"),
                        template_data.get("value"),
                        template_data.get("errors"),
                        template_data.get("warnings"),
                        template_data.get("type"),
                    )
                    return response, HTTPStatus.OK
                else:
                    logger.warning(
                        "RESULT SERVICE: Template status is ready but template file not found",
                        txn_id=txn_id,
                        b_id=b_id,
                        template_id=template_id,
                        severity="medium",
                    )
                    response = self._build_template_response(
                        transaction, template_id, status
                    )
                    return response, HTTPStatus.INTERNAL_SERVER_ERROR

            time.sleep(POLL_INTERVAL_SECONDS)

        logger.warning(
            "RESULT SERVICE: Template polling timeout",
            txn_id=txn_id,
            b_id=b_id,
            template_id=template_id,
            elapsed_time=time.time() - start_time,
            severity="medium",
        )

        response = self._build_template_response(
            transaction, template_id, "in-progress"
        )
        return response, 202

    def poll_for_transcript_result(
        self, txn_id: str, b_id: str, encode_base64: bool = True
    ) -> Tuple[Dict[str, Any], int]:
        """
        Poll for transcript result until completion or timeout (3 seconds).
        Polls every 0.3 seconds. If result is ready within 3 seconds, returns it.
        Otherwise returns 202
        Args:
            txn_id: Transaction ID
            b_id: Business ID
            encode_base64: Whether to encode the transcript to base64
        Returns:
            Tuple of (response_dict, status_code)
        """
        transaction = self.transaction_repo.get_transaction(txn_id, b_id)
        if not transaction:
            raise TransactionNotFoundException(txn_id, b_id)

        if transaction.get("user_status") != UserStatus.COMMIT.value:
            logger.info(
                "TRANSCRIPT API: Transaction not yet committed - still processing",
                txn_id=txn_id,
                b_id=b_id,
            )
            return (
                self._build_template_response(
                    transaction,
                    "transcript",
                    "processing",
                    errors=["Transaction not yet committed"],
                ),
                HTTPStatus.BAD_REQUEST.value,
            )

        if transaction.get("transcript_status") == "failed":
            return (
                self._build_template_response(
                    transaction,
                    "transcript",
                    "failed",
                    errors=["Transcript processing failed"],
                ),
                HTTPStatus.INTERNAL_SERVER_ERROR.value,
            )

        s3_url = transaction.get("s3_url", "")

        start_time = time.time()
        # max duration to poll the transcript s3 logs from backend in 20 sec on devsl
        dev_poll_duration = 20
        prod_poll_duration = 10
        poll_wait_time = 0.5

        def _get_transcript_poll_duration():
            env = os.getenv("ENV", "prod")
            return dev_poll_duration if env != "prod" else prod_poll_duration

        while (time.time() - start_time) < _get_transcript_poll_duration():
            # try reading transcript from the template_results/transcripts/ folder.
            # if not found, then read from the logs/transcript.json folder.
            file_from_s3 = self.template_file_service.read_transcript_file(
                s3_url=s3_url, txn_id=txn_id, fallback_to_legacy=True
            )

            # transcript_text = (file_from_s3 or {}).get("text")
            if file_from_s3:
                logger.info(
                    "TRANSCRIPT API: Transcript ready",
                    txn_id=txn_id,
                    b_id=b_id,
                    elapsed_time=time.time() - start_time,
                    severity="medium",
                )
                # build base response
                response = self._build_template_response(
                    transaction, "transcript", "success"
                )
                # This will add all transcripts to template_results.transcript
                self.add_transcript_to_response(response, transaction)

                # If encode_base64 is True, they are already encoded in add_transcript_to_response
                # If False, we might need to decode them or handle differently, but usually API expects base64
                if not encode_base64:
                    # Decode from base64 if needed, but add_transcript_to_response always encodes
                    # For simplicity, let's assume API always wants them base64 or add_transcript_to_response handles it
                    pass

                return (response, HTTPStatus.OK.value)

            time.sleep(poll_wait_time)

        logger.info(
            "TRANSCRIPT API: Transcript not ready after polling timeout",
            txn_id=txn_id,
            b_id=b_id,
            elapsed_time=time.time() - start_time,
            severity="medium",
        )

        # this should not happen, but if it does, return accepted.
        # transcript should always be available after 10 seconds of user committed the session.
        return (
            self._build_template_response(transaction, "transcript", "in-progress"),
            HTTPStatus.ACCEPTED.value,
        )

    # build specific template response from output file.
    def _build_template_specific_response(
        self,
        output_file: Dict[str, Any],
        transaction_data: Dict[str, Any],
        template_id: str,
        txn_id: str,
    ) -> Tuple[Dict[str, Any], int]:
        """
        Build response for specific template result.
        Args:
            output_file: Downloaded output.json content
            transaction_data: Transaction data from DB
            template_id: Template ID
            txn_id: Transaction ID

        Returns:
            Tuple of (response dict with template result, status code)
        """
        response = {
            "data": {
                "created_at": transaction_data.get("created_at", ""),
                "output": [],
                "additional_data": self._get_additional_data(transaction_data),
                "audio_matrix": {},
                "template_results": {
                    "integration": [],
                    "custom": [],
                    "transcript": [],
                },
            }
        }
        _ = self.calculate_audio_quality(response, txn_id, transaction_data.get("b_id"))

        outputs = output_file.get("structured_outputs", {})
        output_template_result = transaction_data.get("output_template_result", {})
        template_metadata = output_file.get("meta_information", {})

        if template_id not in outputs:
            logger.warning(
                "RESULT SERVICE: Template not found in output file",
                txn_id=txn_id,
                template_id=template_id,
                severity="medium",
            )
            return response, HTTPStatus.INTERNAL_SERVER_ERROR

        # get template status and metadata
        template_value = outputs[template_id]
        template_info = output_template_result.get(template_id, {})
        template_status = template_info.get("status", "success")
        template_errors = template_info.get("errors", [])
        template_warnings = template_info.get("warnings", [])

        # build template data
        template_data = {
            "template_id": template_id,
            "value": template_value,
            "type": (
                template_metadata.get(template_id, {}).get("type", "")
                or OUTPUT_TEMPLATES.get(template_id, {})
                .get("details", {})
                .get("type", "")
                or "text"
            ),
            "name": (
                template_metadata.get(template_id, {}).get("name", "")
                or OUTPUT_TEMPLATES.get(template_id, {})
                .get("details", {})
                .get("name", "")
                or template_id
            ),
            "status": template_status,
            "errors": template_errors,
            "warnings": template_warnings,
        }

        templateid_to_map = self._get_templateid_to_type({template_id})
        self._add_to_new_result_format(
            response,
            template_data,
            template_id,
            templateid_to_map,
            template_errors,
            template_warnings,
            txn_id,
        )

        # determine status code based on template status
        if template_status == VOICE2RX_TEMPLATE_STATUS.FAILURE.value or template_errors:
            status_code = HTTPStatus.INTERNAL_SERVER_ERROR
        elif (
            template_status == VOICE2RX_TEMPLATE_STATUS.PARTIAL_SUCCESS.value
            or template_warnings
        ):
            status_code = HTTPStatus.PARTIAL_CONTENT
        else:
            status_code = HTTPStatus.OK

        return response, status_code

    # build template response for provided value and template id.
    def _build_template_response(
        self,
        transaction_data: Dict[str, Any],
        template_id: str,
        status: str,
        value: str = "",
        errors: List[str] = [],
        warnings: List[str] = [],
        template_type: str = "",
    ) -> Dict[str, Any]:
        """
        Build empty response for template when result not available.
        Args:
            transaction_data: Transaction data
            template_id: Template ID
            status: Template status

        Returns:
            Response dict
        """
        response = {
            "data": {
                "created_at": transaction_data.get("created_at", ""),
                "output": [],
                "additional_data": self._get_additional_data(transaction_data),
                "audio_matrix": {},
                "template_results": {
                    "integration": [],
                    "custom": [],
                    "transcript": [],
                },
            }
        }
        _ = self.calculate_audio_quality(
            response, transaction_data.get("txn_id"), transaction_data.get("b_id")
        )

        template_data = {
            "template_id": template_id,
            "value": value,
            "type": template_type or "json",
            "name": template_id,
            "status": status,
            "errors": errors,
            "warnings": warnings,
        }

        template_results = response["data"]["template_results"]

        if template_id == "transcript":
            template_results["transcript"].append(template_data)
            template_data["type"] = DocumentType.TRANSCRIPT
        elif template_id in INTEGRATION_TEMPLATE_IDS:
            template_results["integration"].append(template_data)
        else:
            template_results["custom"].append(template_data)

        return response
    
    def process_template_results(
        self,
        output_file: Dict[str, Any],
        transaction_data: Dict[str, Any],
        txn_id: str,
    ) -> Dict[str, Any]:
        """
        Process template results from output file.

        Args:
            output_file: Downloaded output.json content
            transaction_data: Transaction data from DB
            txn_id: Transaction ID

        Returns:
            Processed response with template results
        """
        response = {
            "data": {
                "created_at": transaction_data.get("created_at", ""),
                "output": [],
                "additional_data": self._get_additional_data(transaction_data),
                "audio_matrix": {},
                "template_results": {
                    "integration": [],
                    "custom": [],
                    "transcript": [],
                },
            }
        }

        _ = self.calculate_audio_quality(response, txn_id, transaction_data.get("b_id"))
        outputs = output_file.get("structured_outputs", {})
        # todo: get template errors or warning from scribe_template_result table instead of transaction table.
        # also save error and warning in scribe_template_result table not in transaction table. [[ this has to be done.]]
        output_template_result = transaction_data.get("output_template_result", {})
        template_metadata = output_file.get("meta_information", {})
        output_format_template = transaction_data.get("output_format_template", [])

        if not output_format_template:
            transaction_data = TemplateFormatConverter.convert_to_old_format(
                transaction_data
            )
            output_format_template = transaction_data.get("output_format_template", [])

        # build template type map
        template_type_map = {
            template.get("template_id"): template.get("template_type", "default")
            for template in output_format_template
            if template.get("template_id")
        }

        # get template details
        # we can always take the template ids from outputs , because outputs are fetched from template_results, but somtime for empty 
        # audio cases ds service is writing empty output.json so template_results also getting empty, so we need to take the template id from output_format_template as well.
        output_format_template_ids = set(template.get("template_id") for template in output_format_template)
        template_ids = set(outputs.keys()) | output_format_template_ids
        templateid_to_map = self._get_templateid_to_type(template_ids)

        def get_template_type(template_id: str) -> str:
            return (
                template_metadata.get(template_id, {}).get("type", "")
                or OUTPUT_TEMPLATES.get(template_id, {})
                .get("details", {})
                .get("type", "")
                or "text"
            )

        def get_template_name(template_id: str) -> str:
            template_name = template_metadata.get(template_id, {}).get("name", "") or (
                templateid_to_map.get(template_id, {}).get("template_name", "")
            )
            if not template_name:
                template_name = template_id
            return template_name.strip()

        def build_template_data(
            template_id: str,
            template_value: Any,
            template_status: str,
            template_errors: list,
            template_warnings: list,
        ) -> Dict[str, Any]:

            template_type = get_template_type(template_id)

            # !hack , this is a temporaty hack to handle the template type etc
            # everyone needs to be moved to template_results section for output.
            if template_id == "eka_emr_template":
                template_type = "eka_emr"
            elif template_type_map.get(template_id, "") == "custom":
                template_type = "custom"
                # check if template type is json or markdown. based on that return
                flavour = transaction_data.get("flavour", "default")
                if flavour == "extension":
                    template_type = templateid_to_map.get(template_id, {}).get(
                        "response_type", "custom"
                    )
                    if template_type == "json":
                        template_type = "custom"

            return {
                "template_id": template_id,
                "value": template_value,
                "type": template_type,
                "name": get_template_name(template_id),
                "status": template_status,
                "errors": template_errors,
                "warnings": template_warnings,
            }

        # handle case where no structured output have been generated
        if not outputs:
            for template in output_format_template:
                template_id = template.get("template_id")
                template_data = build_template_data(
                    template_id=template.get("template_id"),
                    template_value="",
                    template_status=template.get("status", "success"),
                    template_errors=template.get("errors", []),
                    template_warnings=template.get("warnings", []),
                )
                response["data"]["output"].append(template_data)

                self._add_to_new_result_format(
                    response,
                    template_data,
                    template_id,
                    templateid_to_map,
                    template_data["errors"],
                    template_data["warnings"],
                    txn_id,
                )

            return response, HTTPStatus.OK

        # handle case where structured output have been generated
        status_flags = {
            "has_success_or_partial": False,
            "all_failed": True,
            "has_partial": False,
            "all_successful": True,
        }

        for template_id, template_value in outputs.items():
            # get template info from transaction data.
            template_info = output_template_result.get(template_id, {})
            template_status = template_info.get("status", "success")
            template_errors = template_info.get("errors", [])
            template_warnings = template_info.get("warnings", [])

            if template_status in [
                VOICE2RX_TEMPLATE_STATUS.SUCCESS.value,
                VOICE2RX_TEMPLATE_STATUS.PARTIAL_SUCCESS.value,
            ]:
                status_flags["has_success_or_partial"] = True
                status_flags["all_failed"] = False

            if template_status == VOICE2RX_TEMPLATE_STATUS.PARTIAL_SUCCESS.value:
                status_flags["has_partial"] = True
                status_flags["all_successful"] = False

            elif template_status == VOICE2RX_TEMPLATE_STATUS.FAILURE.value:
                status_flags["all_successful"] = False

            template_data = build_template_data(
                template_id=template_id,
                template_value=template_value,
                template_status=template_status,
                template_errors=template_errors,
                template_warnings=template_warnings,
            )
            response["data"]["output"].append(template_data)
            self._add_to_new_result_format(
                response,
                template_data,
                template_id,
                templateid_to_map,
                template_errors,
                template_warnings,
                txn_id,
            )

        self._add_fhir_json_template(response, transaction_data)
        # get status code based on the template results.
        if status_flags["all_failed"]:
            status_code = HTTPStatus.INTERNAL_SERVER_ERROR
        elif status_flags["has_partial"] or (
            not status_flags["all_successful"]
            and status_flags["has_success_or_partial"]
        ):
            status_code = HTTPStatus.PARTIAL_CONTENT
        else:
            status_code = HTTPStatus.OK

        priority_map = {
            "eka_emr_template": 0,
            "eka_emr_w_codes_template": 1,
        }
        response["data"]["output"].sort(
            key=lambda x: priority_map.get(x["template_id"], 2)
        )

        return response, status_code

    # add transcript data to response.
    def add_transcript_to_response(
        self, response: Dict[str, Any], transaction_data: Dict[str, Any]
    ) -> None:
        """
        Add transcript data to response.
        Reads all transcripts from new location with fallback to legacy.

        Args:
            response: Response dict to modify
            transaction_data: Transaction data from DB
        """
        s3_url = transaction_data.get("s3_url", "")
        txn_id = transaction_data.get("txn_id")

        # read all transcripts (original + translated or converted)
        transcripts = self.template_file_service.read_all_transcripts(
            s3_url=s3_url, txn_id=txn_id, fallback_to_legacy=True
        )

        if not transcripts:
            logger.error(
                "RESULT SERVICE: No transcript files found",
                txn_id=txn_id,
                b_id=transaction_data.get("b_id"),
                severity="critical",
            )
            response["data"]["template_results"]["transcript"].append(
                {
                    "value": "",
                    "template_id": "",
                    "type": DocumentType.TRANSCRIPT,
                    "lang": "",
                    "status": "failed",
                    "errors": ["Transcript file not found"],
                    "warnings": [],
                }
            )
            return

        response["data"]["template_results"]["transcript"] = []
        for transcript_data in transcripts:
            text = transcript_data.get("text", "")
            lang = transcript_data.get("lang", "")

            # if not text:
            #     continue

            # encode transcript in base64,cause API expects resulsts in base64
            encoded_bytes = base64.b64encode(text.encode("utf-8"))
            encoded_string = encoded_bytes.decode("utf-8")

            template_id = f"transcript_{lang}" if lang else "transcript"
            response["data"]["template_results"]["transcript"].append(
                {
                    "template_id": template_id,
                    "value": encoded_string,
                    "type": DocumentType.TRANSCRIPT,
                    "lang": lang or transaction_data.get("output_language") or "",
                    "status": "success",
                    "errors": [],
                    "warnings": [],
                }
            )

    def calculate_audio_quality(
        self, response: Dict[str, Any], txn_id: str, b_id: str
    ) -> None:
        """
        Calculate and add audio quality to response.

        Args:
            response: Response dict to modify
            txn_id: Transaction ID
            b_id: Business ID
        """
        try:
            from voice2rx.api.endpoints.transactions.transaction_actions import (
                get_audio_quality_details,
            )

            audio_matrix = response.get("data", {}).get("audio_matrix", {})
            audio_response = get_audio_quality_details(txn_id, b_id)

            if audio_response["status"] == "failed":
                return

            total_audio_quality = 0.0
            available_quality = 0

            for item in audio_response["data"]:
                try:
                    quality_val = item.get("quality")
                    if quality_val is not None:
                        total_audio_quality += float(quality_val)
                        available_quality += 1
                except Exception as e:
                    logger.warning(
                        "RESULT SERVICE: Failed to parse quality value",
                        txn_id=txn_id,
                        b_id=b_id,
                        error=str(e),
                        severity="medium",
                    )

            if available_quality > 0:
                audio_matrix["quality"] = round(
                    total_audio_quality / available_quality, 2
                )
            else:
                audio_matrix["quality"] = None

            response["data"]["audio_matrix"] = audio_matrix
            logger.info(
                "RESULT SERVICE: Audio quality calculated",
                txn_id=txn_id,
                b_id=b_id,
                quality=audio_matrix["quality"],
            )

            return audio_matrix
        except Exception as e:
            logger.error(
                "RESULT SERVICE: Error calculating audio quality",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                severity="medium",
            )
            return None

    def update_template_data(
        self,
        txn_id: str,
        b_id: str,
        template_updates: List[Dict[str, Any]],
    ) -> List[str]:
        """
        Update template data by writing to individual template files.

        Reads output.json to validate template existence, then writes updates
        to individual template files at template_results/templates/{template_id}.json.

        Args:
            txn_id: Transaction ID
            b_id: Business ID
            template_updates: List of {template_id, data} dicts

        Returns:
            Tuple of (updated_template_ids, file_path)

        Raises:
            Exception: If update fails
        """
        # Get transaction
        transaction = self.transaction_repo.get_transaction(txn_id, b_id)
        if not transaction:
            raise TransactionNotFoundException(txn_id, b_id)

        s3_url = transaction.get("s3_url")
        if not s3_url:
            raise RequestFailureException(
                "S3 URL not configured for this transaction", txn_id=txn_id, b_id=b_id
            )

        updated_templates = []
        for update in template_updates:
            template_id = update["template_id"]
            data_to_write = update["data"]

            template_data = self.template_file_service.read_template_file(
                s3_url=s3_url,
                template_id=template_id,
                txn_id=txn_id,
            )

            if not template_data:
                raise ResourceNotFoundException(
                    "Template not available that you are trying to edit.",
                    txn_id=txn_id,
                    b_id=b_id,
                )

            if template_data.get("template_id") == template_id:
                template_data["value"] = data_to_write

                written_path = self.template_file_service.write_template_file(
                    s3_url=s3_url,
                    template_id=template_id,
                    template_data=template_data,
                    txn_id=txn_id,
                )
                updated_templates.append(template_id)

                logger.info(
                    "RESULT SERVICE: Template updated to individual file",
                    txn_id=txn_id,
                    b_id=b_id,
                    template_id=template_id,
                    file_path=written_path,
                    severity="medium",
                )

        return updated_templates

    # Private helper methods
    def _is_transaction_too_old(self, transaction: Dict[str, Any]) -> bool:
        """Check if transaction is older than 2 hours."""
        try:
            created_at_str = transaction.get("created_at", "")
            created_at_dt = datetime.strptime(
                created_at_str, "%Y-%m-%dT%H:%M:%SZ"
            ).replace(tzinfo=timezone.utc)
            return created_at_dt < datetime.now(timezone.utc) - timedelta(hours=2)
        except Exception as e:
            logger.error(
                "RESULT SERVICE: Error parsing created_at",
                txn_id=transaction.get("txn_id"),
                error=str(e),
                severity="medium",
            )
            return True

    def download_output_file(
        self, transaction: Dict[str, Any], txn_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Download template results - tries new location first, falls back to output.json.

        This method reads all template files from template_results/templates/ folder
        and aggregates them into output.json format. If files not found, falls back
        to reading output.json directly for backward compatibility.
        """
        s3_url = transaction.get("s3_url", "")

        # try reading all template files from the template_results/templates/ folder.
        # if not found, then read from the output.json folder.
        logger.info(
            "RESULT SERVICE: Attempting to read template results from new location",
            txn_id=txn_id,
        )
        output_data = self.template_file_service.read_all_template_files(
            s3_url=s3_url, txn_id=txn_id, fallback_to_output_json=True
        )

        return output_data

    def _get_additional_data(self, transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and parse additional_data from transaction."""
        additional_data = transaction_data.get("additional_data", {})

        if isinstance(additional_data, dict):
            return additional_data

        if isinstance(additional_data, (str, bytes)):
            try:
                return orjson.loads(additional_data)
            except (orjson.JSONDecodeError, TypeError) as e:
                logger.error(
                    "RESULT SERVICE: Failed to parse additional data",
                    txn_id=transaction_data.get("txn_id"),
                    error=str(e),
                    severity="medium",
                )
                return {}

        logger.warning(
            "RESULT SERVICE: Unexpected type for additional_data",
            txn_id=transaction_data.get("txn_id"),
            type=type(additional_data).__name__,
            severity="medium",
        )
        return {}

    def _get_templateid_to_type(self, template_ids: set) -> dict:
        templateid_to_map = {}
        templates_details = self.template_service.get_templates_by_ids(list(template_ids))
        found_template_ids = set()

        for template in templates_details:
            template_id = template.get("id")
            found_template_ids.add(template_id)

            if not template.get("section_ids"):
                response_type = "markdown"
            else:
                response_type = "json"
            templateid_to_map[template_id] = {
                "template_type": template.get("type", "") or "custom",
                "response_type": response_type,
                "template_name": template.get("title", "") or "",
            }

        # for template_ids not found in templates_details, set defaults.
        for template_id in template_ids:
            if template_id not in found_template_ids:
                templateid_to_map[template_id] = {
                    "template_type": "custom",
                    "response_type": "json",
                    "template_name": "",
                }

        return templateid_to_map

    def _add_to_new_result_format(
        self,
        response: Dict[str, Any],
        template_data: Dict[str, Any],
        template_id: str,
        templateid_to_map: Dict[str, Dict[str, str]],
        template_errors: List,
        template_warnings: List,
        txn_id: str,
    ) -> None:
        """Add template to new result format structure."""
        try:
            template_data_v2 = copy.deepcopy(template_data)
            template_map_info = templateid_to_map.get(template_id, {})
            template_type_val = template_map_info.get("template_type")
            template_response_type = template_map_info.get("response_type")

            template_data_v2["type"] = template_response_type or "json"

            if (template_type_val == "integration" or template_id in INTEGRATION_TEMPLATE_IDS):
                response["data"]["template_results"]["integration"].append(
                    template_data_v2
                )
            elif template_id not in LEGACY_TEMPLATE_IDS:
                    response["data"]["template_results"]["custom"].append(
                        template_data_v2
                    )

            if template_errors:
                template_data_v2["errors"] = template_errors
            if template_warnings:
                template_data_v2["warnings"] = template_warnings

        except Exception as e:
            logger.error(
                "RESULT SERVICE: Error in new result format",
                txn_id=txn_id,
                error=str(e),
                severity="medium",
            )

    def _template_processing_status(
        self, transaction_data: Dict[str, Any], b_id: str, session_id: str
    ) -> bool:
        try:
            template_results = self.template_results_repo.get_all_template_results(
                session_id
            )
            if not template_results:
                raise ResourceNotFoundException("template not found")

            for template_result in template_results:
                status = template_result.get("status")
                commit_at = template_result.get("commit_at")
                try:
                    process_start_ts = (
                        float(commit_at)
                        if isinstance(commit_at, (float, int, Decimal))
                        else float(iso_to_epoch(commit_at))
                    )
                except Exception as _:
                    logger.error(
                        "RESULT SERVICE: Error parsing commit_at",
                        txn_id=session_id,
                        b_id=b_id,
                        commit_at=commit_at,
                        severity="medium",
                    )
                    # fallback to return whatever is ready now.
                    process_start_ts = time.time() - 60
                if status == "in-progress" and commit_at:
                    elapsed_time = time.time() - process_start_ts
                    if elapsed_time < PROCESSING_TIMEOUT_SECONDS:
                        return False
            return True

        except Exception as e:
            logger.error(
                "TEMPLATE PROCESSING STATUS: Error checking template processing status",
                txn_id=session_id,
                b_id=b_id,
                error=str(e),
                severity="medium",
            )
            return True

    def _get_processing_completed_status(
        self,
        processing_status: str,
        transaction: Dict[str, Any],
        b_id: str,
        txn_id: str,
    ) -> bool:
        if (
            processing_status == VOICE2RX_PROCESSING_STATUS.SUCCESS.value
            and (b_id != "EC_173373528300322" or transaction.get("fhir_ingested"))
            and self._template_processing_status(transaction, b_id, txn_id)
        ):
            return True
        return False

    def _add_fhir_json_template(
        self, response: Dict[str, Any], transaction_data: Dict[str, Any]
    ) -> None:
        try:
            b_id = transaction_data.get("b_id", "") or transaction_data.get("c_id", "")
            txn_id = transaction_data.get("txn_id", "")
            if b_id == "EC_173373528300322" and transaction_data.get("fhir_ingested"):
                template_value = fetch_intermediate_fhir_result(txn_id)
                template_data = {
                    "template_id": "fhir_json",
                    "value": template_value,
                    "type": "json",
                    "name": "FHIR JSon",
                    "status": "success",
                    "errors": [],
                    "warnings": [],
                }
                response["data"]["output"].append(template_data)

        except Exception as e:
            logger.error(
                "RESULT SERVICE: Error in adding fhir_json template",
                txn_id=transaction_data.get("txn_id"),
                error=str(e),
                severity="medium",
            )
            return
