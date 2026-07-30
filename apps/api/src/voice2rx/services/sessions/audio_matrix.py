"""
Aggregate audio-quality computation shared across the result-status flow and
the sessions API.

Reads per-chunk quality rows from the ekascribe-audio-details table via
AudioDetailsORM and returns an audio_matrix dict suitable for inclusion in an
API response.
"""

from typing import Any, Dict, Optional

from logs.custom_logger import get_logger
from voice2rx.model_orms.audio_details_orm import AudioDetailsORM

logger = get_logger(__name__)


def compute_audio_matrix(
    session_id: str,
    b_id: str,
    audio_repo: Optional[AudioDetailsORM] = None,
) -> Dict[str, Any]:
    """Compute the audio_matrix dict for a session.

    Returns ``{"quality": <float>}`` averaged across chunks that report a
    quality value, ``{"quality": None}`` when chunks exist but none carry a
    quality, and ``{}`` on missing-data or error.
    """
    repo = audio_repo or AudioDetailsORM()
    audio_matrix: Dict[str, Any] = {}

    try:
        response = repo.get_audio_quality_details(session_id, b_id)
        if not response.get("success"):
            return audio_matrix

        items = response.get("data", []) or []
        total = 0.0
        counted = 0
        for item in items:
            try:
                quality = item.get("quality")
                if quality is None:
                    continue
                total += float(quality)
                counted += 1
            except Exception as e:
                logger.warning(
                    "AUDIO MATRIX: failed to parse quality value",
                    txn_id=session_id,
                    b_id=b_id,
                    error=str(e),
                    severity="medium",
                )

        audio_matrix["quality"] = round(total / counted, 2) if counted > 0 else None
        return audio_matrix

    except Exception as e:
        logger.error(
            "AUDIO MATRIX: error computing audio matrix",
            txn_id=session_id,
            b_id=b_id,
            error=str(e),
            severity="medium",
        )
        return {}
