import os

from logs.custom_logger import get_logger
from voice2rx.services.storage import S3StorageClient
from voice2rx.services.webhooks import ScribeEvent, emit

logger = get_logger(__name__)


def send_webhook_notification(
    transaction_id: str,
    business_id: str,
    client_id: str,
    send_audio_url: bool = False
) -> None:
    """
    Send the v2rx.completed webhook via the async webhook dispatcher.

    Args:
        transaction_id (str): The transaction ID for the notification
        business_id (str): The business ID
        client_id (str): The client ID
        send_audio_url (bool): Attach a presigned URL to the combined audio
    """
    try:
        data = {}
        if send_audio_url:
            destination_s3_bucket = os.getenv("S3_COMBINED_AUDIO_BUCKET", "voice-records-audio")
            destination_s3_key = f"{business_id}/{transaction_id}_combined.mp3"

            presigned_url = S3StorageClient(
                bucket_name=destination_s3_bucket
            ).generate_presigned_get_url(destination_s3_key)
            logger.info(f"Generated presigned url for {transaction_id} in business {business_id}, presigned url: {presigned_url}")
            data["original_audio_url"] = presigned_url

        emit(
            ScribeEvent.V2RX_COMPLETED,
            b_id=business_id,
            c_id=client_id,
            txn_id=transaction_id,
            data=data,
        )
    except Exception as e:
        logger.error("Error sending webhook notification", exc_info=True, error=str(e), severity="critical")
