"""Regression test for multipart file upload on ai-create-template.

`await request.form()` yields starlette.datastructures.UploadFile, which is NOT
an instance of fastapi.UploadFile (a subclass). The endpoint must therefore
type-check against Starlette's UploadFile or the file is silently dropped and
`file_base64` comes back empty (-> 400 "Provide at least one of ...").
"""

import base64
import io

import pytest
from starlette.datastructures import FormData, UploadFile

from voice2rx.api.endpoints.template_api import _extract_ai_template_inputs


class _FakeRequest:
    def __init__(self, headers, form_data):
        self.headers = headers
        self._form = form_data

    async def form(self):
        return self._form


@pytest.mark.asyncio
async def test_multipart_file_is_read_into_file_base64():
    raw = b"%PDF-1.4 fake pdf bytes"
    upload = UploadFile(filename="note.pdf", file=io.BytesIO(raw))
    form = FormData([("file", upload), ("instruction", "make a template")])

    req = _FakeRequest(
        headers={"content-type": "multipart/form-data; boundary=abc"},
        form_data=form,
    )

    out = await _extract_ai_template_inputs(req)

    assert out["file_base64"] == base64.b64encode(raw).decode("utf-8")
    assert out["file_name"] == "note.pdf"
    assert out["instruction"] == "make a template"


@pytest.mark.asyncio
async def test_multipart_without_file_keeps_scalar_fields():
    form = FormData([("instruction", "just an instruction")])
    req = _FakeRequest(
        headers={"content-type": "multipart/form-data; boundary=abc"},
        form_data=form,
    )

    out = await _extract_ai_template_inputs(req)

    assert out["file_base64"] is None
    assert out["instruction"] == "just an instruction"
