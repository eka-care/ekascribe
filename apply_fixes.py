#!/usr/bin/env python3
"""Apply the 5 ekascribe pipeline fixes in place. Idempotent. Run from repo root:
    python3 apply_fixes.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API = ROOT / "apps/api/src/voice2rx"

def patch(rel, old, new, label):
    p = API / rel
    t = p.read_text()
    if new in t:
        print(f"  [skip] {label} (already applied)")
        return
    if old not in t:
        print(f"  [FAIL] {label}: anchor not found in {rel} — apply manually")
        return
    p.write_text(t.replace(old, new, 1))
    print(f"  [ok]   {label}")

# 1) transcript template_id fallback
patch("services/documents/populate_documents_service.py",
'''            existing_doc_id = self.document_service.get_document_id_by_session_and_template(session_id, template_id)
            if not existing_doc_id:
                raise Exception(f"transcript entry not found for session-id:{session_id}")''',
'''            existing_doc_id = self.document_service.get_document_id_by_session_and_template(session_id, template_id)
            if not existing_doc_id and lang:
                existing_doc_id = self.document_service.get_document_id_by_session_and_template(
                    session_id, "transcript"
                )
            if not existing_doc_id:
                raise Exception(f"transcript entry not found for session-id:{session_id}")''',
"transcript template_id fallback")

# 2) document write -> blob store
patch("services/documents/document_service.py",
'''            s3_client.put_object(
                Bucket=self.bucket_name,
                Key=file_key,
                Body=content.encode("utf-8") if isinstance(content, str) else content,
                ContentType="text/plain",
            )''',
'''            from scribe_core.storage import get_blob_store

            get_blob_store().put(
                self.bucket_name,
                file_key,
                content.encode("utf-8") if isinstance(content, str) else content,
                content_type="text/plain",
            )''',
"document content write -> blob store")

# 3) document read -> blob store
patch("services/transactions/result_service_v2.py",
'''            response = boto_s3_client.get_object(
                Bucket=self.bucket_name, Key=document_path
            )
            content = response["Body"].read().decode("utf-8")
            return content''',
'''            from scribe_core.storage import get_blob_store

            content = get_blob_store().get(self.bucket_name, document_path).decode("utf-8")
            return content''',
"document content read -> blob store")

# 4) context download -> blob store
patch("services/context/context_resolution_service.py",
'''            s3_client = get_s3_client()
            response = s3_client.get_object(Bucket=bucket, Key=key)
            body = response["Body"].read()
            content_type = response.get("ContentType", "") or ""
            return body, content_type''',
'''            from scribe_core.storage import get_blob_store
            import mimetypes

            body = get_blob_store().get(bucket, key)
            content_type = mimetypes.guess_type(key)[0] or ""
            return body, content_type''',
"context download -> blob store")

# 5) combine_audios -> blob store (constructor + upload + list + download)
patch("services/transactions/combine_audios.py",
'        self.s3_client = boto3.client("s3", region_name="ap-south-1")',
'''        from scribe_core.storage import get_blob_store

        self.store = get_blob_store()''',
"combine_audios: constructor")
patch("services/transactions/combine_audios.py",
'''            self.s3_client.upload_file(
                file_path, bucket_name, file_key, ExtraArgs=extra_args
            )''',
'''            with open(file_path, "rb") as fh:
                self.store.put(
                    bucket_name,
                    file_key,
                    fh.read(),
                    content_type=extra_args.get("ContentType", "application/octet-stream"),
                )''',
"combine_audios: upload")
patch("services/transactions/combine_audios.py",
'''        paginator = self.s3_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket, Prefix=prefix)

        numeric_files = []
        for page in pages:
            if "Contents" not in page:
                continue

            for obj in page["Contents"]:
                s3_key = obj["Key"]
                if s3_key.endswith("/"):
                    continue

                if not (s3_key.endswith(".mp3") or s3_key.endswith(".m4a")):''',
'''        numeric_files = []
        for s3_key in self.store.list(bucket, prefix):
            if True:
                if s3_key.endswith("/"):
                    continue

                if not (s3_key.endswith(".mp3") or s3_key.endswith(".m4a")):''',
"combine_audios: list")
patch("services/transactions/combine_audios.py",
'                self.s3_client.download_file(source_bucket, s3_key, temp_file)',
'''                with open(temp_file, "wb") as fh:
                    fh.write(self.store.get(source_bucket, s3_key))''',
"combine_audios: download")

print("\nDone. Restart:  make api   and   make worker")