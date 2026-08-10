"""Unit tests for server-side upload text extraction."""

import io

import pytest

from scribe.core.text_extraction import extract_text


def test_plain_text_by_extension():
    raw = "hello\nworld".encode("utf-8")
    assert extract_text(raw, media_type=None, file_name="notes.txt") == "hello\nworld"


def test_csv_decoded_as_text():
    raw = b"a,b,c\n1,2,3"
    assert extract_text(raw, media_type="text/csv", file_name="data.csv") == "a,b,c\n1,2,3"


def test_text_by_mime_only():
    raw = b"plain body"
    # no filename, generic text/* mime still routes to text
    assert extract_text(raw, media_type="text/markdown", file_name=None) == "plain body"


def test_pdf_returns_none_handled_natively():
    assert extract_text(b"%PDF-1.4 ...", media_type="application/pdf", file_name="x.pdf") is None


def test_image_returns_none_handled_natively():
    assert extract_text(b"\x89PNG", media_type="image/png", file_name="x.png") is None


def test_unsupported_binary_returns_none():
    assert extract_text(b"\x00\x01\x02", media_type="application/octet-stream", file_name="a.bin") is None


def test_empty_text_returns_none():
    assert extract_text(b"   \n  ", media_type="text/plain", file_name="blank.txt") is None


def test_rtf_extraction():
    striprtf = pytest.importorskip("striprtf")  # noqa: F841
    rtf = r"{\rtf1\ansi\deff0 {\fonttbl {\f0 Times;}}\f0\fs24 Hello RTF world.\par}"
    out = extract_text(rtf.encode("utf-8"), media_type="application/rtf", file_name="note.rtf")
    assert out is not None
    assert "Hello RTF world." in out


def test_docx_extraction():
    docx = pytest.importorskip("docx")  # python-docx
    document = docx.Document()
    document.add_paragraph("First paragraph")
    document.add_paragraph("Second paragraph")
    buf = io.BytesIO()
    document.save(buf)

    out = extract_text(
        buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_name="note.docx",
    )
    assert out is not None
    assert "First paragraph" in out
    assert "Second paragraph" in out


def test_docx_by_extension_when_mime_missing():
    docx = pytest.importorskip("docx")
    document = docx.Document()
    document.add_paragraph("Body text")
    buf = io.BytesIO()
    document.save(buf)

    out = extract_text(buf.getvalue(), media_type=None, file_name="report.docx")
    assert out is not None and "Body text" in out
