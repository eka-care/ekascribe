"""
Patient Summary Service

Orchestrates patient summary generation via two flows:
1. Lucid API (when OID is available) - Calls external Lucid API for pre-generated summaries
2. Session History (fallback) - Runs TemplateGenerationAgent on each session transcript
   to produce clinical notes, then feeds all notes to SummaryAgent for a unified summary.

Always falls back to session-history flow if Lucid API fails or returns no data.
"""

import os
from typing import Any, Dict, List, Optional

import httpx

from logs.custom_logger import get_logger
from voice2rx.agents.agent_config import LLMAgentConfig
from voice2rx.agents.summary_agent import SummaryAgent
from voice2rx.agents.template_agent import TemplateGenerationAgent
from voice2rx.model_orms.transaction_orm import TransactionORM
from voice2rx.services.templates.input_preparers import prepare_template_prompt
from voice2rx.services.templates.template_result_file_service import (
    TemplateResultFileService,
)

logger = get_logger(__name__)

LUCID_BASE_URL = os.getenv("LUCID_BASE_URL", "https://lucid.eka.care")

class PatientSummaryService:
    """Service for generating patient summaries."""

    def __init__(
        self,
        transaction_repo: Optional[TransactionORM] = None,
        template_file_service: Optional[TemplateResultFileService] = None,
    ):
        self.transaction_repo = transaction_repo or TransactionORM()
        self.template_file_service = (
            template_file_service or TemplateResultFileService()
        )

        def clinical_notes_template_id():
            if os.getenv("ENV") == "prod":
                return "9d9675c6-b29b-424a-abac-99ddd3b8909c"
            return "3d707c1c-311e-4424-80e9-e5d7a229d519"

        self.clinical_notes_template_id = clinical_notes_template_id()

    async def get_patient_summary(
        self,
        b_id: str,
        oid: Optional[str] = None,
        flavour: str = "scribe",
    ) -> Dict[str, Any]:
        """
        Main entry point for patient summary generation.
        Tries Lucid API first (if oid is present), falls back to session-history.
        Args:
            b_id: Business ID from JWT
            oid: Optional patient OID
            flavour: Flavour for Lucid API (default: 'scribe')

        Returns:
            Structured response with patient_info, summary_text, source_type
        """
        try:
            summary_data = await self._get_summary_from_lucid(oid, flavour)
        except Exception as e:
            logger.error("Error fetching summary from Lucid API", oid=oid, error=str(e), severity="medium")
            summary_data = None

        if not summary_data:
            # try with the older sessions data.
            summary_data = await self._get_summary_from_sessions(b_id, oid)

        return {
            "patient_info": {"oid": oid},
            "summary_data": summary_data,
            "source_type": "internal_agent",
        }

    async def _get_summary_from_lucid(
        self, oid: str, flavour: str = "scribe"
    ) -> Optional[Dict[str, Any]]:
        """
        Call Lucid API to get patient summary.
        Args:
            oid: Patient OID
            flavour: API flavour parameter

        Returns:
            Summary text string or None if unavailable
        """
        url = f"{LUCID_BASE_URL}/doc/v2/poll_generate_summary"
        params = {"pt_oid": oid, "flavour": flavour}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, params=params)

            if response.status_code != 200:
                logger.warning(
                    "Lucid API returned non-200 status",
                    status_code=response.status_code,
                    oid=oid,
                    severity="medium",
                )
                return None

            data = response.json()
            summary_data = data.get("most_recent_summary") 
            return summary_data

        except httpx.TimeoutException:
            logger.error("Lucid API timed out", oid=oid, severity="medium")
            return None
        except Exception as e:
            logger.error(
                "Error calling Lucid API",
                oid=oid,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            return None

    async def _get_summary_from_sessions(
        self, b_id: str, oid: str, limit: int = 10
    ) -> Optional[str]:
        """
        Generate summary using a multi-agent pipeline:
        1. Fetch recent sessions for the patient
        2. For each session: download transcript → run TemplateGenerationAgent to produce clinical notes
        3. Collect all clinical notes and feed to SummaryAgent for final summary

        Args:
            b_id: Business ID
            oid: Patient OID
            limit: Max sessions to fetch

        Returns:
            Generated summary text or None
        """
        try:
            # fetch recent successful sessions for the patient.
            sessions = self.transaction_repo.get_patient_sessions(
                b_id=b_id, oid=oid, limit=limit
            )
            if not sessions:
                raise Exception("No sessions found for patient")

            # prepare template prompt once (reused across all sessions)
            template_name, final_prompt, response_type, date_str, schema_str = (
                prepare_template_prompt(
                    template_id=self.clinical_notes_template_id,
                    txn_id=f"summary_{oid}",
                    b_id=b_id,
                    integration=False,
                )
            )

            logger.info(
                "Template prompt prepared for summary generation",
                b_id=b_id,
                oid=oid,
                template_id=self.clinical_notes_template_id,
                template_name=template_name,
                response_type=response_type,
                severity="medium",
            )

            agent_config = LLMAgentConfig.from_env()

            # for each session: fetch transcript → run TemplateGenerationAgent
            all_clinical_notes = []
            for session in sessions:
                s3_url = session.get("s3_url", "")
                txn_id = session.get("txn_id", "")

                if not s3_url or not txn_id:
                    continue

                try:
                    transcript_data = self.template_file_service.read_transcript_file(
                        s3_url=s3_url,
                        txn_id=txn_id,
                        fallback_to_legacy=True,
                    )

                    if not transcript_data or not transcript_data.get("text"):
                        logger.warning(
                            "No transcript found for session",
                            txn_id=txn_id,
                            severity="medium",
                        )
                        continue

                    transcript_text = transcript_data["text"]
                    clinical_notes_output, _details = await TemplateGenerationAgent.generate(
                        transcript=transcript_text,
                        final_prompt=final_prompt,
                        agent_config=agent_config,
                        txn_id=txn_id,
                        response_type=response_type,
                        date=date_str,
                        schema=schema_str,
                    )

                    if clinical_notes_output:
                        session_date = session.get("created_at", "unknown date")
                        all_clinical_notes.append(
                            f"--- Session: {txn_id} | Date: {session_date} ---\n{clinical_notes_output}"
                        )

                    logger.info(
                        "Clinical notes generated for session",
                        txn_id=txn_id,
                        output_length=len(clinical_notes_output) if clinical_notes_output else 0,
                        severity="medium",
                    )

                except Exception as e:
                    logger.warning(
                        "Failed to generate clinical notes for session",
                        txn_id=txn_id,
                        error=str(e),
                        severity="medium",
                    )
                    continue

            if not all_clinical_notes:
                logger.info(
                    "No clinical notes generated across sessions",
                    b_id=b_id,
                    oid=oid,
                    severity="medium",
                )
                return None
            
            concatenated_notes = "\n\n".join(all_clinical_notes)
            logger.info(
                "Generating summary from clinical notes",
                b_id=b_id,
                oid=oid,
                session_count=len(all_clinical_notes),
                total_chars=len(concatenated_notes),
            )

            summary = await SummaryAgent.generate(
                clinical_notes_text=concatenated_notes,
                agent_config=agent_config,
                request_id=f"summary_{oid}",
            )

            return summary

        except Exception as e:
            logger.error(
                "Error generating summary from sessions",
                b_id=b_id,
                oid=oid,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return None
