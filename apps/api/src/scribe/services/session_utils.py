import os

SESSION_DURATION_SECONDS = 3600


def compute_upload_url(
    session_id: str,
    upload_type: str,
    batch_s3_url: str = None,
    s3_url: str = None,
    b_id: str = "",
    flavour: str = "",
    version: str = "",
) -> "str | dict":
    # On-prem: derive from SELF_URL (settings); API_BASE_URL env still wins if set.
    from scribe_core.settings import get_settings

    base_url = os.getenv("API_BASE_URL") or f"{get_settings().self_url.rstrip('/')}/voice"
    backend_url = f"{base_url}/v1/sessions/{session_id}/audio"

    # single uploads always go through the backend, regardless of version
    if upload_type != "chunked":
        return backend_url

    is_v2 = (version or "").strip().lower() == "v2"
    legacy_s3_eligible = flavour and flavour not in [
        "ekascribe-desktop-mac",
        "ekascribe-desktop-windows",
    ]

    if is_v2 or (legacy_s3_eligible and s3_url):
        from scribe.services.adaptors.audio_adaptor import AudioAdaptor

        audio_adaptor = AudioAdaptor()
        return audio_adaptor.generate_presigned_post_for_upload(
            session_data={
                "txn_id": session_id,
                "b_id": b_id,
                "batch_s3_url": batch_s3_url,
                "s3_url": s3_url,
                "mode": "dictation",
                "upload_type": upload_type,
            }
        )

    return backend_url


def compute_session_expires_at(created_at_epoch: int) -> int:
    return created_at_epoch + SESSION_DURATION_SECONDS
