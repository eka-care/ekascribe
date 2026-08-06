"""Orchestrator for publishing a document to all configured integrations.

The HTTP handler constructs a `PublishService`, calls `schedule_publish()` to
accept the request (202 semantics), and the provided BackgroundTasks runner
fans out to every enabled integration. Results (`publish_status`) and any
`vault_doc_id` returned by the EMR integration are persisted back on the
document row so clients can observe via the existing GET endpoint.
"""

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks

from logs.custom_logger import get_logger
from voice2rx.core.exceptions import ResourceNotFoundException
from voice2rx.model_orms.transaction_orm import TransactionORM
from voice2rx.services.config_service import ConfigService
from voice2rx.services.documents.document_service import DocumentService
from voice2rx.services.publish import factory
from voice2rx.services.publish.base import PublishContext, PublishResult
from voice2rx.utils.time_utils import get_current_epoch_timestamp

logger = get_logger(__name__)


class PublishService:
    """Coordinates config lookup, integration dispatch, and result persistence."""

    def __init__(
        self,
        document_service: Optional[DocumentService] = None,
        transaction_repo: Optional[TransactionORM] = None,
        config_service: Optional[ConfigService] = None,
    ):
        self.document_service = document_service or DocumentService()
        self.transaction_repo = transaction_repo or TransactionORM()
        self.config_service = config_service or ConfigService()

    def schedule_publish(
        self,
        session_id: str,
        document_id: str,
        token_data: Dict[str, Any],
        b_id: str,
        background_tasks: BackgroundTasks,
    ) -> Dict[str, Any]:
        """Validate, build context, enqueue background dispatch, return ack payload."""
        jwt_uuid = token_data.get("uuid", "")
        doc = self.document_service.get_document(document_id)
        if not doc or doc.get("archived"):
            raise ResourceNotFoundException(f"Document not found: {document_id}")
        if doc.get("uuid") != jwt_uuid:
            raise ResourceNotFoundException(f"Document not found: {document_id}")
        if doc.get("session_id") != session_id:
            raise ResourceNotFoundException(
                f"Document {document_id} does not belong to session {session_id}"
            )

        transaction = self.transaction_repo.get_transaction(session_id, b_id)
        if not transaction:
            raise ResourceNotFoundException(f"Transaction not found: {session_id}")

        ctx = self._build_context(doc, transaction, token_data, b_id)
        accepted_at = get_current_epoch_timestamp()

        self.document_service.update_document(
            document_id,
            {"published_at": accepted_at},
        )

        background_tasks.add_task(self._run_all, ctx)

        return {
            "document_id": document_id,
            "session_id": session_id,
            "accepted_at": accepted_at,
        }

    def _build_context(
        self,
        doc: Dict[str, Any],
        transaction: Dict[str, Any],
        token_data: Dict[str, Any],
        b_id: str,
    ) -> PublishContext:
        # token_data is the original `jwt-payload` header parsed by the router.
        # Propagate it as-is on the context so every downstream external call
        # (parchi profile, vault create/replace, S3 upload) re-uses the same
        # caller identity instead of a server-reconstructed copy.
        uuid_val = doc.get("uuid") or token_data.get("uuid", "")
        wid = doc.get("wid") or b_id
        
        # insted of the getting oid from the doctor oid, get the patient oid form the transacton 
        # table , fallback to doctor oid form the token data
        oid = transaction.get("patient_oid")
        if not oid:
            oid = token_data.get("oid", "")

        client_id = token_data.get("c-id", "")

        return PublishContext(
            document=doc,
            transaction=transaction,
            session_id=doc.get("session_id", ""),
            encounter_id=transaction.get("encounter_id", "") or "",
            b_id=wid,
            uuid=uuid_val,
            oid=oid,
            jwt_payload=token_data,
            client_id=client_id,
        )

    def _run_all(self, ctx: PublishContext) -> None:
        """Invoked in a BackgroundTasks runner — dispatch and persist results."""
        document_id = ctx.document.get("document_id", "")
        try:
            integrations_cfg = {}
            # if there is not any integration of the user ,, assuming the EMR webhook integration for now
            # this has to be removed later , and integration will be completly a new module.
            if not integrations_cfg:
                integrations_cfg = {
                    "emr_webhook" : {
                        "enabled" : "true",
                        # "webhook_endpoint" : "http://messenger.orbi.orbi/internal/v1/webhook",
                    }
                }

        except Exception as exc:
            logger.error(
                "Failed to load integrations config",
                document_id=document_id,
                error=str(exc),
                exc_info=True,
                severity="critical",
            )
            integrations_cfg = {}

        results: List[PublishResult] = []
        for integration, subcfg in factory.create_enabled(integrations_cfg):
            try:
                results.append(integration.publish(ctx, subcfg))
            except Exception as exc:
                logger.error(
                    "Integration raised unexpectedly",
                    integration=integration.name,
                    document_id=document_id,
                    error=str(exc),
                    exc_info=True,
                    severity="critical",
                )
                results.append(
                    PublishResult(
                        integration=integration.name,
                        status="failed",
                        error=str(exc),
                    )
                )

        self._persist_results(document_id, results)

    def _persist_results(
        self, document_id: str, results: List[PublishResult]
    ) -> None:
        now = get_current_epoch_timestamp()
        publish_status: Dict[str, Any] = {}
        vault_doc_id: Optional[str] = None
        any_success = False

        for result in results:
            publish_status[result.integration] = {
                "status": result.status,
                "error": result.error,
                "updated_at": now,
            }
            if result.status == "success":
                any_success = True
            if (
                result.integration == "emr_webhook"
                and result.status == "success"
                and result.data.get("vault_doc_id")
            ):
                vault_doc_id = result.data["vault_doc_id"]

        update_data: Dict[str, Any] = {"publish_status": publish_status}
        if vault_doc_id:
            update_data["vault_doc_id"] = vault_doc_id
        if any_success:
            update_data["published_at"] = now

        try:
            self.document_service.update_document(document_id, update_data)
        except Exception as exc:
            logger.error(
                "Failed to persist publish results",
                document_id=document_id,
                error=str(exc),
                exc_info=True,
                severity="medium",
            )

        logger.info(
            "Publish results persisted",
            document_id=document_id,
            results=[asdict(r) for r in results],
        )
