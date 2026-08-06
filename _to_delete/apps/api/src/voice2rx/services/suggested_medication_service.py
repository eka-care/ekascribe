"""
Suggested Medication Service

Orchestrates medication suggestion for a session:
1. Fetches template results from S3
2. Extracts medications via MedicationExtractionAgent (LLM)
3. Enriches each medication via Alchemist search API
4. Returns combined list
"""

import asyncio
import os
from typing import Any, Dict, List, Optional

import orjson

from logs.custom_logger import get_logger
from voice2rx.agents.agent_config import LLMAgentConfig
from voice2rx.agents.medication_agent import MedicationExtractionAgent
from voice2rx.model_orms.transaction_orm import TransactionORM
from voice2rx.services.templates.template_result_file_service import (
    TemplateResultFileService,
)

logger = get_logger(__name__)

# NOTE(oss): alchemist (eka-internal enrichment) replaced by the local
# Postgres formulary (plan decision #20). FEATURE_DRUG_SEARCH gates it.


class SuggestedMedicationService:
    """Service for retrieving suggested medications for a session."""

    def __init__(
        self,
        transaction_repo: Optional[TransactionORM] = None,
        template_file_service: Optional[TemplateResultFileService] = None,
    ):
        self.transaction_repo = transaction_repo or TransactionORM()
        self.template_file_service = (
            template_file_service or TemplateResultFileService()
        )

    async def get_suggested_medications(
        self, session_id: str, b_id: str
    ) -> Dict[str, Any]:
        """
        Main orchestration: fetch template data → extract medications → enrich via Alchemist.

        Args:
            session_id: Transaction / session ID
            b_id: Business ID from JWT

        Returns:
            Dict with session_id and medications list
        """
        transaction = self.transaction_repo.get_transaction(session_id, b_id)
        if not transaction:
            raise ValueError(f"Transaction not found for session_id={session_id}")

        s3_url = transaction.get("s3_url", "")
        if not s3_url:
            raise ValueError(f"No s3_url found for session_id={session_id}")

        template_data = self.template_file_service.read_all_template_files(
            s3_url=s3_url, txn_id=session_id
        )

        structured_outputs = template_data.get("structured_outputs", {})
        if not structured_outputs:
            logger.info(
                "No template results found for session",
                session_id=session_id,
            )
            return {"session_id": session_id, "medications": []}

        template_text = orjson.dumps(structured_outputs, option=orjson.OPT_INDENT_2).decode()

        logger.info(
            "Extracting medications from template data",
            session_id=session_id,
            template_count=len(structured_outputs),
            text_length=len(template_text),
        )

        agent_config = LLMAgentConfig.from_env()
        extracted_medications = await MedicationExtractionAgent.extract(
            template_data_text=template_text,
            agent_config=agent_config,
            request_id=f"med_extract_{session_id}",
        )

        if not extracted_medications:
            logger.info(
                "No medications extracted by agent",
                session_id=session_id,
            )
            return {"session_id": session_id, "medications": []}

        logger.info(
            "Medications extracted by agent",
            session_id=session_id,
            count=len(extracted_medications),
            severity="medium",
        )

        enrichment_tasks = [
            self._search_alchemist(med.get("name", ""))
            for med in extracted_medications
            if med.get("name")
        ]
        alchemist_results = await asyncio.gather(*enrichment_tasks, return_exceptions=True)

        medications = []
        alchemist_idx = 0
        for med in extracted_medications:
            entry = {"extracted": med, "suggestions": []}
            if med.get("name"):
                result = alchemist_results[alchemist_idx]
                alchemist_idx += 1
                if isinstance(result, list):
                    entry["suggestions"] = result
                elif isinstance(result, Exception):
                    logger.warning(
                        "Alchemist search failed for medication",
                        medication_name=med.get("name"),
                        error=str(result),
                        severity="medium",
                    )
            medications.append(entry)

        return {"session_id": session_id, "medications": medications}

    @staticmethod
    async def _search_alchemist(query: str, b_id: str = "") -> List[Dict[str, Any]]:
        """Search the LOCAL Postgres formulary for a medication query.

        Replaces the eka-internal Alchemist API (plan decision #20). Returns []
        when FEATURE_DRUG_SEARCH is off or the formulary is not loaded — the
        suggested-medications feature is optional (decision #11).
        """
        from scribe_core.settings import get_settings

        if not get_settings().feature_drug_search:
            return []
        try:
            from voice2rx.services.templates.ag_ui.tools.medication.search import (
                PostgresMedicationSearch,
            )

            hits = await PostgresMedicationSearch().search(b_id=b_id, name=query)
            return [hit.model_dump() for hit in hits]
        except Exception as e:
            logger.warning(
                "Local formulary search failed (is the drug catalog loaded?)",
                query=query,
                error=str(e),
                severity="medium",
            )
            return []
