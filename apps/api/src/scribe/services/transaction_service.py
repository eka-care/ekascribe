"""
Transaction service containing business logic for transaction operations.
"""

import os
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import orjson
import json
from fastapi import BackgroundTasks
from scribe.core.custom_logger import get_logger
from scribe.repositories.transaction_orm import TransactionORM
from scribe.repositories.audio_details_orm import AudioDetailsORM
from scribe.repositories.transaction_template_orm import TxnTemplateResultsORM
from scribe.services.document_service import DocumentService
from scribe.services.config_service import ConfigService
from scribe.core.exceptions import (
    TemplateProcessingException,
    TransactionNotFoundException,
    TransactionLimitExceededException,
    DuplicateTransactionException,
)
from scribe.core.validation import validate_s3_urls
from scribe.core.choices import (
    VOICE2RX_PROCESSING_STATUS,
    DocumentType,
    Transfer,
    UserStatus,
    Action,
)
from scribe.pipeline.enqueue import enqueue_pipeline
from scribe.services.combine_audios import (
    background_audio_combine_task,
)
from scribe.services.format_adapter import TemplateFormatConverter
from scribe.services.template_service import TemplateService
from scribe.repositories.s3_utils import get_s3_client, list_files_in_s3_folder
from scribe.core.time_utils import (
    get_current_epoch_timestamp,
    get_current_utc_timestamp,
)
from scribe.core.constants import exculuded_apps
from scribe.services.user_utils import is_user_paid
from scribe.core.utils import convert_to_s3_protocol

logger = get_logger(__name__)



class TransactionService:
    
    def __init__(
        self,
        transaction_repo: Optional[TransactionORM] = None,
        audio_repo: Optional[AudioDetailsORM] = None,
        template_results_repo: Optional[TxnTemplateResultsORM] = None,
    ):
        self.transaction_repo = transaction_repo or TransactionORM()
        self.audio_repo = audio_repo or AudioDetailsORM()
        self.template_results_repo = template_results_repo or TxnTemplateResultsORM()
        self.document_service = DocumentService()
        self.config_service = ConfigService()
        self.tempalte_service = TemplateService()
        self.s3_vaded_bucket = os.getenv("S3_VADED_BUCKET_NAME", "voice-records")

    def initialize_transaction(
        self,
        txn_id: str,
        transaction_data: Dict[str, Any],
        headers: Dict[str, Any],
    ) -> Dict[str, Any]:
        # prepare transaction data
        prepared_data = self._prepare_transaction_data(
            transaction_data, headers, txn_id
        )
        b_id = prepared_data["b_id"]
        paid_user = prepared_data.pop("_paid_user", False)
        # todo : create transaction table serializer and validator to validate the init data
        logger.info(
            "TRANSACTION_SERVICE: Initializing transaction",
            txn_id=txn_id,
            b_id=b_id,
        )
        # validate transaction limit
        self._validate_transaction_limit(paid_user, b_id, txn_id, headers)

        # validate s3 urls
        validate_s3_urls(
            prepared_data.get("transfer"),
            prepared_data.get("s3_url"),
            prepared_data.get("batch_s3_url"),
        )

        if prepared_data.get("flavour") not in exculuded_apps:
            self._store_document_results(txn_id, prepared_data)

        # insert the transaction data into the transaction db.
        result = self.transaction_repo.create_transaction(prepared_data)
        if result.get("error"):
            if result["code"] == "duplicate_entry":
                raise DuplicateTransactionException(txn_id)
            raise Exception(result["error"])

        # publish to sns for vadding if it's a non-vaded transfer.

        # if session is initialized via medalliance protocl routers. audio will be uploaded after session initialization.
        # so request for vading will be sent later on session end request.
        # not in initialize transaction. (but for lagacy call first audio get's uploaded then session initialization happens for non-vaded transfer.)
        # both cases need to be handled. so that lagecy and medalliance protocol both work.
        additional_data = prepared_data.get("additional_data")
        if additional_data:
            additional_data_json = orjson.loads(additional_data)
            transfer = additional_data_json.get("_protocol", {}).get("upload_type")
            if transfer == Transfer.NON_VADED.value:
                # self._publish_to_sns_for_vadding(prepared_data, txn_id, b_id)
                return prepared_data

        self._publish_to_sns_for_vadding(prepared_data, txn_id, b_id)

        return prepared_data

    def stop_transaction(
        self,
        txn_id: str,
        b_id: str,
        audio_files: List[str],
        chunk_info: Optional[List[dict]] = None,
    ) -> Dict[str, Any]:
        logger.info(
            "TRANSACTION_SERVICE: Stopping transaction", txn_id=txn_id, b_id=b_id
        )
        transaction = self.transaction_repo.get_transaction(txn_id, b_id)
        if not transaction:
            raise TransactionNotFoundException(txn_id, b_id)

        update_data = {
            "user_status": UserStatus.STOPPED.value,
            "client_generated_files": audio_files,
        }

        if chunk_info:
            update_data["chunk_info"] = chunk_info

        result = self.transaction_repo.update_transaction(txn_id, b_id, update_data)
        if result.get("error"):
            raise Exception(result["error"])

        logger.info(
            "TRANSACTION_SERVICE: Transaction stopped successfully",
            txn_id=txn_id,
            b_id=b_id,
            severity="medium",
        )

        return result.get("data", {})

    def ensure_session_documents(
        self,
        txn_id: str,
        b_id: str,
        transaction: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        documents = self.document_service.get_documents_for_session(txn_id)
        template_docs = [
            d
            for d in documents
            if d.get("type") not in (DocumentType.CONTEXT, DocumentType.NOTES, DocumentType.TRANSCRIPT)
        ]
        if template_docs:
            return documents
        self._store_document_results(txn_id, transaction)
        return self.document_service.get_documents_for_session(txn_id)

    def commit_transaction(
        self,
        txn_id: str,
        b_id: str,
        audio_files: List[str],
        chunk_info: Optional[List[dict]] = None,
        background_tasks: Optional[BackgroundTasks] = None,
    ) -> Dict[str, Any] | None:
        logger.info(
            "TRANSACTION_SERVICE: Committing transaction",
            txn_id=txn_id,
            b_id=b_id,
            file_count=len(audio_files),
        )

        # fetch transaction
        transaction = self.transaction_repo.get_transaction(txn_id, b_id)
        if not transaction:
            raise TransactionNotFoundException(txn_id, b_id)

        # prepare update data
        commit_at = get_current_utc_timestamp()
        commit_at_epoch = get_current_epoch_timestamp()
        update_data = {
            "user_status": UserStatus.COMMIT.value,
            "client_uploaded_files": audio_files,
            "commit_at": commit_at,
        }

        if chunk_info:
            update_data["chunk_info"] = chunk_info

        # update transaction
        result = self.transaction_repo.update_transaction(txn_id, b_id, update_data)
        if result.get("error"):
            raise Exception(result["error"])

        # update all template results commit_at time, this will be used for processing status/time comparison.

        # template_documents = TemplateFormatConverter.get_all_templates(transaction_data=transaction)
        # document_ids = [t.get("document_id") for t in template_documents if t.get("document_id")]
        # document_results = self.document_service.get_documents_by_ids(document_ids=document_ids)

        # transaction was fetched before user_status flipped to COMMIT, so it
        # still reflects the pre-commit state; on a re-commit skip creation.
        already_committed = transaction.get("user_status") == UserStatus.COMMIT.value
        if not already_committed and transaction.get("flavour") in exculuded_apps:
            document_results = self.ensure_session_documents(
                txn_id, b_id, transaction
            )
        else:
            document_results = self.document_service.get_documents_for_session(txn_id)

        if not document_results:
            logger.critical(
                "DOCUMENT_NOT_AVAILABLE: while getting the documents in commit,this shoudn't be the case",
                txn_id=txn_id,
                b_id=b_id,
                severity="critical",
            )
            # raise Exception("Error while doing the commit session, document not found")
            document_results = []

        for doc in document_results:
            self.document_service.update_document(
                document_id=doc.get("document_id"),
                update_data={
                    "commit_at": commit_at_epoch,
                },
            )

        self._schedule_audio_combine(txn_id, b_id, transaction, background_tasks)
        logger.info(
            "TRANSACTION_SERVICE: Transaction committed successfully",
            txn_id=txn_id,
            b_id=b_id,
            severity="medium",
        )

        return transaction

    def _schedule_audio_combine(
        self,
        txn_id: str,
        b_id: str,
        transaction: Dict[str, Any],
        background_tasks: Optional[BackgroundTasks],
    ) -> None:
        audio_full_enabled = self.config_service.check_audio_full_enabled(b_id)
        if not (
            audio_full_enabled
            and transaction.get("transfer") == Transfer.VADED.value
        ):
            return

        if background_tasks is None:
            logger.warning(
                "TRANSACTION_SERVICE: audio combine skipped - no background tasks",
                txn_id=txn_id,
                b_id=b_id,
                severity="medium",
            )
            return

        logger.info(
            "TRANSACTION_SERVICE: Audio combine enabled, adding background task",
            txn_id=txn_id,
            b_id=b_id,
        )
        background_tasks.add_task(
            background_audio_combine_task,
            txn_id=txn_id,
            b_id=b_id,
            source_s3_path=transaction["s3_url"],
        )

    def enqueue_processing(
        self,
        txn_id: str,
        b_id: str,
        transaction_data: Dict[str, Any],
        audio_files: List[str],
    ) -> bool:
        try:
            # prepare request data for sqs.
            # [[note --> do not send the same transaction table data in sqs]]
            sqs_data = TemplateFormatConverter.prepare_for_sqs(transaction_data.copy())
            s3_url = sqs_data["s3_url"]
            audio_full_path = self._build_full_s3_paths(audio_files, s3_url)

            client_generated_files = sqs_data.get("client_generated_files", [])
            client_generated_file_path = self._build_full_s3_paths(
                client_generated_files, s3_url
            )

            # download prompts from s3 and add it to sqs_data["output_format_template"] if available.
            sqs_data.pop("request_templates", None)
            if sqs_data.get("additional_data"):
                sqs_data["additional_data"] = orjson.loads(sqs_data["additional_data"])
            
            action = Action.STRUCTURING.value
            message = {
                "txn_id": txn_id,
                "audio_file_list": audio_full_path,
                "action": action,
                "generated_files_path": client_generated_file_path,
                "model_type": sqs_data.get("model_type"),
            }

            message.update(sqs_data)
            logger.info(
                "TRANSACTION_SERVICE: Sending commit message to SQS (old format)",
                txn_id=txn_id,
                b_id=b_id,
            )
            sqs_response = enqueue_pipeline(message)

            if not sqs_response["success"]:
                logger.error(
                    "TRANSACTION_SERVICE: Failed to send message to SQS",
                    txn_id=txn_id,
                    b_id=b_id,
                    error=sqs_response.get("error", ""),
                    severity="critical",
                )
                return False

            return True

        except Exception as e:
            logger.error(
                "TRANSACTION_SERVICE: Error sending commit to SQS",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return False

    def get_transaction(self, txn_id: str, b_id: str) -> Dict[str, Any]:
        transaction = self.transaction_repo.get_transaction(txn_id, b_id)
        
        if not transaction:
            raise TransactionNotFoundException(txn_id, b_id)
        return transaction

    def get_transactions(
        self, uuid: str, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        transactions = self.transaction_repo.get_transactions(uuid, limit)
        return transactions

    def get_patient_sessions(
        self, b_id: str, oid: str, uuid: Optional[str] = None, limit: int = 10
    ) -> List[Dict[str, Any]]:
        return self.transaction_repo.get_patient_sessions(b_id, oid, uuid, limit)

    def update_transaction(
        self, txn_id: str, b_id: str, update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        result = self.transaction_repo.update_transaction(txn_id, b_id, update_data)

        if result.get("error"):
            if result["error"] == "Transaction not found":
                raise TransactionNotFoundException(txn_id, b_id)
            raise Exception(result["error"])

        return result.get("data", {})

    def process_s3_files_and_send_to_sqs(
        self, transaction_data: Dict[str, Any], s3_files: List[str], action: str
    ) -> None:
        txn_id = transaction_data.get("txn_id")
        b_id = transaction_data.get("b_id")

        logger.info(
            "TRANSACTION_SERVICE: Processing S3 files for SQS",
            txn_id=txn_id,
            b_id=b_id,
            action=action,
            file_count=len(s3_files),
        )

        try:
            # Convert to old format for SQS
            sqs_data = TemplateFormatConverter.prepare_for_sqs(transaction_data.copy())

            messages = []
            file_name_list = []

            for file_key in s3_files:
                file_name = file_key.split("/")[-1]
                file_name_list.append(file_name)
                s3_url = sqs_data.get("s3_url", "")

                message = {
                    "txn_id": txn_id,
                    "audio_file_list": [f"{s3_url}/{file_key}"],
                    "action": action,
                }
                message.update(sqs_data)
                messages.append(message)

            for message in messages:
                enqueue_pipeline(message)

            # Update transaction with processed files
            transaction = self.transaction_repo.get_transaction(txn_id, b_id)
            if transaction:
                current_sqs_files = transaction.get("sqs_files", [])
                current_sqs_files.extend(file_name_list)
                self.transaction_repo.update_transaction(
                    txn_id, b_id, {"sqs_files": current_sqs_files}
                )

            logger.info(
                "TRANSACTION_SERVICE: Successfully processed S3 files",
                txn_id=txn_id,
                b_id=b_id,
            )

        except Exception as e:
            logger.critical(
                "TRANSACTION_SERVICE: Failed to process S3 files",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )

    def check_for_preupload_files(
        self, s3_url: str, txn_id: str, b_id: str
    ) -> List[str]:
        if not s3_url:
            return []

        logger.info(
            "TRANSACTION_SERVICE: Checking for pre-uploaded files",
            txn_id=txn_id,
            b_id=b_id,
            s3_url=s3_url,
        )

        s3_client = get_s3_client()
        s3_files = list_files_in_s3_folder(
            s3_client,
            None,
            None,
            extension=None,
            s3_url=s3_url,
            exclude_extensions=[".json", ".m4a_"],
        )

        logger.info(
            f"TRANSACTION_SERVICE: Found {len(s3_files)} pre-uploaded files",
            txn_id=txn_id,
            b_id=b_id,
        )

        return s3_files

    # private helper methods.
    def _prepare_transaction_data(
        self, transaction_data: Dict[str, Any], headers: Dict[str, Any], txn_id: str
    ) -> Dict[str, Any]:
        token_data = headers["token_data"]
        current_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        b_id = token_data.get("b-id") or transaction_data.get("c_id")
        c_id = token_data.get("c-id", "")

        item_data = {
            **transaction_data,
            "txn_id": txn_id,
            "c_id": token_data.get("c-id", ""),
            "b_id": b_id,
            "oid": token_data.get("oid", ""),
            "created_at": current_time,
            "updated_at": current_time,
            "sqs_files": [],
            "error_details": [],
            "flavour": headers["flavour"],
            "version": headers["version"],
            "sdk_version": headers["sdk_version"],
            "user_status": UserStatus.INIT.value,
            "processing_status": VOICE2RX_PROCESSING_STATUS.IN_PROGRESS.value,
            "jwt-payload": {
                "b-id": b_id,
                "c-id": token_data.get("c-id", ""),
                "idp": token_data.get("idp", ""),
            },
            "_paid_user": is_user_paid(b_id, token_data),
        }

        # !hacks (requested by product etc)
        if b_id in [
            "EC_175308121952375",
            "EC_173312757004728",
            "EC_173754209749052",
        ] or c_id in ["C_175308121952375", "C_173312757004728", "C_173754209749052"]:
            item_data["input_language"] = ["auto_detect"]

        if token_data.get("uuid"):
            item_data["uuid"] = token_data.get("uuid")

        if "additional_data" in item_data:
            item_data["additional_data"] = orjson.dumps(
                item_data.get("additional_data") or {}
            ).decode("utf-8")

        # convert template to visual and integration format if output_format_template is given by client.
        # else keep the new requeste_template format as it is.
        item_data = TemplateFormatConverter.parse_request_templates(item_data)
        if item_data.get("transfer") == Transfer.NON_VADED.value:
            item_data["s3_url"] = (
                f"s3://{self.s3_vaded_bucket}/{item_data['c_id']}/{txn_id}"
            )

        for url_field in ["s3_url", "batch_s3_url"]:
            url = item_data.get(url_field, "")
            item_data[url_field] = url.rstrip("/") if url else url

        # !hack:
        # if it's extension flavour and ouput_format_template dosen't have eka_emr_template
        # then add eka_emr_template to output_format_template
        if item_data.get("flavour") == "extension" or (b_id and b_id == "77088166996724"):
            templates = item_data.get("request_templates", {}).get("integration", [])
            if not any(t.get("template_id") == "eka_emr_template" for t in templates):
                item_data["request_templates"]["integration"].append(
                    {"template_id": "eka_emr_template", "template_type": "default"}
                )

            if b_id == "77088166996724":
                item_data["codification_needed"] = True
        # !hack
        # this has to be removed when complete integration module/flow is implemented.
        self._inject_configured_integration_templates(item_data, b_id)

        if item_data.get("patient_details"):
            patient_details = item_data.get("patient_details")
            patient_oid = patient_details.get("oid")
            if patient_oid:
                item_data["patient_oid"] = patient_oid

        return item_data

    def _inject_configured_integration_templates(
        self, item_data: Dict[str, Any], b_id: str
    ) -> None:
        uuid_val = item_data.get("uuid", "")
        if not uuid_val:
            return
        cfg = self.config_service.get_config(b_id, uuid_val) or {}
        configured = cfg.get("integrations") or []
        if not configured:
            return
        
        request_templates = item_data.setdefault("request_templates", {})
        integration_list = request_templates.setdefault("integration", [])
        existing_ids = {t.get("template_id") for t in integration_list}

        for entry in configured:
            tid = entry.get("id")
            if not tid or tid in existing_ids:
                continue
            integration_list.append(
                {
                    "template_id": tid,
                    "template_name": entry.get("name"),
                    "template_type": "integration",
                }
            )

    def _validate_transaction_limit(
        self, paid_user: bool, b_id: str, txn_id: str, headers: Dict[str, Any]
    ) -> None:
        # do not block the paid users and api-key users from transaction limit check.
        token_data = headers.get("token_data", {})
        if token_data.get("idp") == "api-key":
            return None

        paid_bid = {
            "EC_176312605461185",
            "EC_174663241066776",
            "77624320149397",
            "7174714526537653",
            "EC_176059547424959",
            "EC_175975295455422",
            "EC_175308121952375",
            "EC_173373528300322",
        }

        if not paid_user and b_id not in paid_bid:
            count = self.transaction_repo.count_today_transactions(b_id)
            if count >= 20:
                logger.error(
                    "TRANSACTION_SERVICE: Transaction limit exceeded",
                    txn_id=txn_id,
                    b_id=b_id,
                    count=count,
                    severity="medium",
                )
                raise TransactionLimitExceededException()

    def publish_to_sns_for_vadding(
        self, item_data: Dict[str, Any], txn_id: str, b_id: str
    ) -> None:
        self._publish_to_sns_for_vadding(item_data, txn_id, b_id)

    def _publish_to_sns_for_vadding(
        self, item_data: Dict[str, Any], txn_id: str, b_id: str
    ) -> None:
        if item_data.get("transfer") != Transfer.NON_VADED.value or not item_data.get(
            "client_generated_files"
        ):
            return

        try:
            batch_s3_url = convert_to_s3_protocol(item_data.get("batch_s3_url"))
            audio_files = item_data["client_generated_files"]
            client_generated_file_paths = [
                (
                    filename
                    if "s3://" in filename.lower()
                    else f"{batch_s3_url}/{filename}"
                )
                for filename in audio_files
            ]

            sns_payload = {
                "txn_id": txn_id,
                "b_id": b_id,
                "client_id": item_data.get("c_id"),
                "audio_files": client_generated_file_paths,
                "s3_url": item_data["s3_url"],
                "model_type": item_data.get("model_type"),
            }

            # The vad_session task replaces the chunker lambda behind SNS.
            from scribe.pipeline.dispatch import dispatch

            dispatch("vad_session", {"message": sns_payload})
            sns_response = {"backend": "postgres", "task": "vad_session"}

            logger.info(
                "TRANSACTION_SERVICE: Initialized vadding process",
                txn_id=txn_id,
                b_id=b_id,
                sns_response=sns_response,
                severity="medium",
            )

        except Exception as e:
            logger.error(
                "TRANSACTION_SERVICE: Error publishing to SNS",
                txn_id=txn_id,
                b_id=b_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )

    def _build_full_s3_paths(self, audio_files: List[str], s3_url: str) -> List[str]:
        audio_full_path = []
        for audio_file in audio_files:
            if not audio_file.startswith("s3://"):
                if s3_url.endswith("/"):
                    audio_s3_url = s3_url + audio_file
                else:
                    audio_s3_url = s3_url + "/" + audio_file
                audio_full_path.append(audio_s3_url)
            else:
                audio_full_path.append(audio_file)

        return audio_full_path

    def _store_document_results(
        self, txn_id: str, transaction_data: Dict[str, Any]
    ) -> None:
        try:
            user_uuid = transaction_data.get("uuid", "")
            b_id = transaction_data.get("b_id", "")
            all_templates = TemplateFormatConverter.get_all_templates(transaction_data)

            # build lookup of request templates by template_id for enrichment
            request_templates = transaction_data.get("request_templates", {})
            template_lookup = {}
            for section in ("visual", "integration"):
                for entry in request_templates.get(section, []):
                    tid = entry.get("template_id")
                    if tid:
                        template_lookup[tid] = entry

            integration_template_ids = {
                t.get("template_id")
                for t in request_templates.get("integration", [])
                if t.get("template_id")
            }

            for template in all_templates:
                template_id = template.get("template_id")
                # resolve the template name
                template_name = template.get("template_name")
                is_integration = template_id in integration_template_ids
                if not template_name and not is_integration:
                    details = self.tempalte_service.get_template(template_id=template_id)
                    template_name = (details or {}).get("title")
                try:
                    doc_data = self.document_service.create_document(
                        session_id=txn_id,
                        template_id=template_id,
                        uuid_val=user_uuid,
                        wid=b_id,
                        document_name=template_name or template_id,
                        doc_type=DocumentType.INTEGRATION if is_integration else DocumentType.CUSTOM,
                        status="in-progress",
                        prompt_path=transaction_data.get("prompt_s3_url", None),
                        init_doc=True,
                    )
                
                    if template_id in template_lookup:
                        template_lookup[template_id]["document_id"] = doc_data.get("document_id")
                except Exception as doc_err:
                    logger.error(
                        "TRANSACTION_SERVICE: Error creating document entry",
                        txn_id=txn_id,
                        template_id=template_id,
                        error=str(doc_err),
                        severity="medium",
                    )

            # create transcript document entry with in-progress status
            try:
                self.document_service.create_document(
                    session_id=txn_id,
                    template_id="transcript",
                    uuid_val=user_uuid,
                    wid=b_id,
                    doc_type=DocumentType.TRANSCRIPT,
                    status="in-progress",
                    prompt_path=transaction_data.get("prompt_s3_url", None),
                    init_doc=True
                )
            except Exception as doc_err:
                logger.error(
                    "TRANSACTION_SERVICE: Error creating transcript document entry",
                    txn_id=txn_id,
                    error=str(doc_err),
                    severity="medium",
                )

        except Exception as e:
            logger.error(
                "TRANSACTION_SERVICE: Error storing template results",
                txn_id=txn_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise TemplateProcessingException(str(e), txn_id)

