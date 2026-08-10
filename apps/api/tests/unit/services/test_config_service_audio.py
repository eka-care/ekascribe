"""Tests for the audio-related config readers on ConfigService."""

from unittest.mock import patch

import pytest

from scribe.services.config_service import ConfigService

B_ID = "EC_test"


@pytest.fixture
def service():
    return ConfigService()


def _with_config(service, config):
    return patch.object(service, "get_config", return_value=config)


class TestCheckAudioApiEnabled:
    def test_enabled(self, service):
        with _with_config(service, {"audio_api_enabled": True}):
            assert service.check_audio_api_enabled(B_ID) is True

    @pytest.mark.parametrize("config", [{}, {"audio_api_enabled": False}, None])
    def test_disabled_or_absent(self, service, config):
        with _with_config(service, config):
            assert service.check_audio_api_enabled(B_ID) is False

    def test_error_defaults_to_false(self, service):
        with patch.object(service, "get_config", side_effect=Exception("dynamo down")):
            assert service.check_audio_api_enabled(B_ID) is False


class TestGetAudioUrlExpiryHours:
    def test_default_is_24(self, service):
        with _with_config(service, {}):
            assert service.get_audio_url_expiry_hours(B_ID) == 24

    def test_configured_value(self, service):
        with _with_config(service, {"audio_url_expiry_hours": 48}):
            assert service.get_audio_url_expiry_hours(B_ID) == 48

    def test_clamped_to_s3_max_seven_days(self, service):
        with _with_config(service, {"audio_url_expiry_hours": 500}):
            assert service.get_audio_url_expiry_hours(B_ID) == 168

    def test_clamped_to_minimum_one_hour(self, service):
        with _with_config(service, {"audio_url_expiry_hours": 0}):
            assert service.get_audio_url_expiry_hours(B_ID) == 1

    def test_error_defaults_to_24(self, service):
        with patch.object(service, "get_config", side_effect=Exception("dynamo down")):
            assert service.get_audio_url_expiry_hours(B_ID) == 24
