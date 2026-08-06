"""Unit tests for the parchi doctor-profile client."""

from unittest.mock import MagicMock, patch

from voice2rx.services.publish.pdf.doctor_profile_client import (
    fetch_print_layout,
)


PROFILE_BODY = {
    "profile": {
        "professional": {
            "default_clinic": "clinic-42",
            "templates_v2": [
                {
                    "clinicId": "clinic-99",
                    "type": "PRINT",
                    "header_img": "WRONG",
                    "footer_img": "WRONG",
                },
                {
                    "clinicId": "clinic-42",
                    "type": "DIGITAL",
                    "header_img": "STILL-WRONG",
                },
                {
                    "clinicId": "clinic-42",
                    "type": "PRINT",
                    "header_img": "https://cdn.eka/header.png",
                    "footer_img": "https://cdn.eka/footer.png",
                    "header_height": "6cm",
                    "footer_height": "4cm",
                    "margin_left": "2cm",
                    "margin_right": "2cm",
                    "page_size": "A4",
                },
            ],
        }
    }
}


class TestFetchPrintLayout:
    def test_selects_matching_print_template(self):
        with patch(
            "voice2rx.services.publish.pdf.doctor_profile_client.requests"
        ) as req:
            req.get.return_value = MagicMock(
                status_code=200, json=lambda: PROFILE_BODY, text="..."
            )

            layout = fetch_print_layout("oid-1", {"uuid": "u-1"})

        assert layout["header_img"] == "https://cdn.eka/header.png"
        assert layout["footer_img"] == "https://cdn.eka/footer.png"
        assert layout["header_height"] == "6cm"

    def test_returns_none_when_no_print_template(self):
        body = {"profile": {"professional": {"default_clinic": "x", "templates_v2": []}}}
        with patch(
            "voice2rx.services.publish.pdf.doctor_profile_client.requests"
        ) as req:
            req.get.return_value = MagicMock(
                status_code=200, json=lambda: body, text="..."
            )
            assert fetch_print_layout("oid-1", {}) is None

    def test_returns_none_on_http_error(self):
        with patch(
            "voice2rx.services.publish.pdf.doctor_profile_client.requests"
        ) as req:
            req.get.return_value = MagicMock(status_code=500, text="boom")
            assert fetch_print_layout("oid-1", {}) is None

    def test_returns_none_when_oid_missing(self):
        assert fetch_print_layout("", {}) is None
