"""
Unit tests for compute_audio_matrix
(voice2rx/services/sessions/audio_matrix.py).

AudioDetailsORM is fully mocked; tests run without DynamoDB access.
"""

from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from scribe.services import compute_audio_matrix


@pytest.fixture
def mock_repo():
    return MagicMock()


def _success(items):
    return {"success": True, "data": items}


def _missing():
    return {"error": "No audio quality details found"}


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


class TestComputeAudioMatrix:
    def test_averages_quality_across_chunks(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _success(
            [{"quality": 0.9}, {"quality": 0.7}, {"quality": 0.8}]
        )

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {"quality": 0.8}
        mock_repo.get_audio_quality_details.assert_called_once_with("sess-1", "b-1")

    def test_handles_decimal_quality_values(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _success(
            [{"quality": Decimal("0.9")}, {"quality": Decimal("0.7")}]
        )

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {"quality": 0.8}

    def test_rounds_to_two_decimals(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _success(
            [{"quality": 1 / 3}, {"quality": 1 / 3}]
        )

        result = compute_audio_matrix("sess-1", "b-1", mock_repo)
        assert result == {"quality": 0.33}

    def test_single_chunk(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _success(
            [{"quality": 0.65}]
        )

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {"quality": 0.65}


# ---------------------------------------------------------------------------
# edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_returns_empty_when_no_audio_data(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _missing()

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {}

    def test_quality_none_when_no_chunk_carries_quality(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _success(
            [{"quality": None}, {}, {"quality": None}]
        )

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {"quality": None}

    def test_skips_chunks_without_quality_and_averages_the_rest(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _success(
            [{"quality": 1.0}, {"quality": None}, {"quality": 0.5}]
        )

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {"quality": 0.75}

    def test_skips_unparseable_quality_value(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = _success(
            [{"quality": "garbage"}, {"quality": 0.8}]
        )

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {"quality": 0.8}

    def test_returns_empty_on_repo_exception(self, mock_repo):
        mock_repo.get_audio_quality_details.side_effect = RuntimeError("boom")

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {}

    def test_returns_empty_when_data_field_missing(self, mock_repo):
        mock_repo.get_audio_quality_details.return_value = {"success": True}

        assert compute_audio_matrix("sess-1", "b-1", mock_repo) == {"quality": None}


# ---------------------------------------------------------------------------
# default repo
# ---------------------------------------------------------------------------


class TestDefaultRepo:
    def test_constructs_audio_details_orm_when_no_repo_provided(self, monkeypatch):
        from scribe.services import audio_matrix as audio_matrix_mod

        instances = []

        class FakeORM:
            def __init__(self):
                instances.append(self)

            def get_audio_quality_details(self, session_id, b_id):
                return _success([{"quality": 0.9}])

        monkeypatch.setattr(audio_matrix_mod, "AudioDetailsORM", FakeORM)

        result = compute_audio_matrix("sess-1", "b-1")

        assert result == {"quality": 0.9}
        assert len(instances) == 1
