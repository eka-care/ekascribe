"""
Process FHIR Data Service.

Handles processing of FHIR data from voice2rx transactions.
"""

import base64
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

from logs.custom_logger import get_logger
from voice2rx.services.templates.format_adapter import TemplateFormatConverter

logger = get_logger(__name__)


class FHIRResponse:
    """Simple response class for FHIR API calls."""

    def __init__(self, status_code: int, text: str):
        self.status_code = status_code
        self.text = text

    def json(self) -> dict:
        return json.loads(self.text)


def _get_fhir_processor_url() -> Optional[str]:
    """Get FHIR processor URL from environment."""
    url = os.getenv("fhir_processor_url")
    if url is None:
        url = "http://fhir-parser.orbi.orbi/ingest_rx_data"
        logger.warning("FHIR processor URL not configured", severity="medium")
    return url


def download_s3_json_simple(s3_url: str) -> dict:

    try:
        if not s3_url.startswith("s3://"):
            raise ValueError("Invalid S3 URL format. Must start with 's3://'")

        parsed = urlparse(s3_url)
        bucket_name = parsed.netloc
        key_path = parsed.path.strip("/")

        full_key = f"{key_path}/output.json"

        logger.info(f"Downloading from s3://{bucket_name}/{full_key}")

        s3_client = boto3.client("s3")

        response = s3_client.get_object(Bucket=bucket_name, Key=full_key)
        json_content = json.loads(response["Body"].read())

        return json_content

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "NoSuchKey":
            raise FileNotFoundError(f"File not found: s3://{bucket_name}/{full_key}")
        elif error_code == "NoSuchBucket":
            raise FileNotFoundError(f"Bucket not found: {bucket_name}")
        else:
            raise
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON format: {e}")


def send_to_fhir_processor(payload: dict) -> FHIRResponse:
    """
    Send data to FHIR processor API.

    Args:
        payload: The payload to send to the FHIR processor

    Returns:
        FHIRResponse: Response from the FHIR processor API
    """
    import urllib.error
    import urllib.request

    url = _get_fhir_processor_url()
    if not url:
        return FHIRResponse(
            500, json.dumps({"status": "error", "error": "FHIR processor URL not configured"})
        )

    headers = {"Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8")
    logger.info(f"Sending data to FHIR processor API: {url}")

    req = urllib.request.Request(url, headers=headers, data=data, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            body = response.read().decode("utf-8")
            logger.info(f"FHIR processor API response: {response.status}")
            return FHIRResponse(response.status, body)

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        logger.error(f"FHIR processor API HTTP error: {e.code}, body: {body}", severity="critical")
        return FHIRResponse(e.code, body)

    except urllib.error.URLError as e:
        logger.error(f"FHIR processor API URL error: {e}", severity="critical")
        return FHIRResponse(
            500, json.dumps({"status": "error", "error": f"Network error: {str(e)}"})
        )

    except TimeoutError as e:
        logger.error(f"FHIR processor API timeout error: {e}", severity="critical")
        return FHIRResponse(408, json.dumps({"status": "error", "error": "Request timeout"}))

    except Exception as e:
        logger.error(f"FHIR processor API unexpected error: {e}", exc_info=True, severity="critical")
        return FHIRResponse(500, json.dumps({"status": "error", "error": str(e)}))


def update_fhir_ingested_status(
    txn_id: str, b_id: str, status: bool = True, table_name: str = "voice2rx_transactions"
) -> Dict[str, Any]:
    """
    Update the fhir_ingested field in DynamoDB for a given transaction ID.

    Args:
        txn_id: Transaction ID (partition key)
        b_id: Business ID (sort key)
        status: Status to set for fhir_ingested field (default: True)
        table_name: DynamoDB table name (default: 'voice2rx_transactions')

    Returns:
        dict: Response with status and details
    """
    try:
        dynamodb = boto3.resource("dynamodb")
        table = dynamodb.Table(table_name)

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        update_response = table.update_item(
            Key={"txn_id": txn_id, "b_id": b_id},
            UpdateExpression="SET fhir_ingested = :val, updated_at = :timestamp",
            ExpressionAttributeValues={":val": status, ":timestamp": timestamp},
            ReturnValues="UPDATED_NEW",
        )

        logger.info(
            f"Successfully updated fhir_ingested for txn_id {txn_id}, b_id {b_id}",
            extra={"txn_id": txn_id, "b_id": b_id, "fhir_ingested": status},
            severity="medium",
        )

        return {
            "status": "success",
            "txn_id": txn_id,
            "b_id": b_id,
            "updated_attributes": update_response.get("Attributes", {}),
            "message": f"Successfully updated fhir_ingested to {status}",
        }

    except Exception as e:
        error_msg = f"Error updating DynamoDB for txn_id {txn_id}, b_id {b_id}: {str(e)}"
        logger.error(error_msg, exc_info=True, severity="medium")

        return {
            "status": "error",
            "txn_id": txn_id,
            "b_id": b_id,
            "error": str(e),
            "message": error_msg,
        }


def process_fhir_data(transaction_data: dict, txn_id: str, b_id: str, c_id: str) -> Dict[str, Any]:
    """
    Process FHIR data for a transaction.

    This function:
    1. Checks if eka_emr_template is in the output templates
    2. Downloads output.json from S3
    3. Extracts and decodes the eka_emr_template data
    4. Sends the prescription data to the FHIR processor API
    5. Updates the fhir_ingested status in DynamoDB

    Args:
        transaction_data: The transaction data containing templates and s3_url
        txn_id: Transaction ID
        b_id: Business ID
        c_id: Client ID

    Returns:
        dict: Result containing status of S3 download and FHIR processing
    """
    logger.info(
        f"Processing FHIR data for txn_id {txn_id}",
        extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id},
    )
    result = {
        "txn_id": txn_id,
        "s3_status": None,
        "fhir_status": None,
        "client_data": {
            "txn_id": txn_id,
            "b_id": b_id,
            "c_id": c_id,
            "o_id": "",
        },
    }
    try:
        _oid = transaction_data.get("oid", "")
        _s3_url = transaction_data.get("s3_url", "")
        result["client_data"]["o_id"] = _oid

        transaction_data = TemplateFormatConverter.convert_to_old_format(transaction_data)
        transaction_data = TemplateFormatConverter.convert_to_old_format(transaction_data)

        output_format_template = transaction_data.get("output_format_template", [])

        found_emr_template = False
        if output_format_template:
            for item in output_format_template:
                if isinstance(item, dict) and item.get("template_id") == "eka_emr_template":
                    found_emr_template = True
                    break

        logger.info(
            f"Found EMR template: {found_emr_template}",
            extra={"txn_id": txn_id, "b_id": b_id, "found_emr_template": found_emr_template},
        )

        if not found_emr_template or not _s3_url:
            result["fhir_status"] = {
                "status": "skipped",
                "message": "Template is not eka_emr_template or s3_url missing",
                "data": {"emr-template-found": found_emr_template, "s3_url": _s3_url},
            }
            logger.info(
                f"Skipping FHIR processing for txn_id {txn_id}",
                extra={"txn_id": txn_id, "b_id": b_id, "result": result},
            )
            return result

        logger.info(
            f"Processing FHIR data for txn_id {txn_id} with s3_url: {_s3_url}",
            extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id},
        )
        try:
            output_json = download_s3_json_simple(_s3_url)
        except Exception as e:
            logger.error(
                f"Error downloading from S3: {str(e)}",
                extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id, "error": str(e)},
                exc_info=True,
                severity="critical",
            )
            result["s3_status"] = {"status": "error", "error": str(e)}
            return result

        result["s3_status"] = {
            "status": "success",
            "message": "Output.json downloaded successfully",
        }
        logger.info(
            f"Output.json file data: {output_json}",
            extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id},
        )

        structured_outputs = output_json.get("structured_outputs", {})
        eka_emr_data = structured_outputs.get("eka_emr_template", "")

        if eka_emr_data:
            logger.info(
                f"Decoding and saving in fhir database for txn_id {txn_id}",
                extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id},
            )
            decoded_data = base64.b64decode(eka_emr_data).decode("utf-8")
            decoded_json = json.loads(decoded_data)
            logger.info(
                f"Decoded JSON data for txn_id {txn_id}: {decoded_json}",
                extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id},
            )
            prescription_data = decoded_json.get("prescription", {})
            if not prescription_data:
                logger.warning(
                    f"Prescription data is empty for txn_id {txn_id}, skipping FHIR processing",
                    extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id},
                    severity="medium",
                )
                return result

            fhir_payload = {
                "visitid": txn_id,
                "doctor_oid": _oid,
                "is_draft_rx": True,
                "id": txn_id,
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                "context_data": {
                    "patient": {},
                    "doctor": {
                        "_id": _oid,
                        "profile": {"personal": {"name": {"l": "", "f": "Doctor"}}},
                    },
                },
                "tool": prescription_data,
            }

            fhir_response = send_to_fhir_processor(payload=fhir_payload)
            logger.info(
                f"FHIR response for txn_id {txn_id}: {fhir_response.text}",
                extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id},
            )
            if fhir_response.status_code == 200:
                # Update DynamoDB fhir_ingested field
                dynamo_update_result = update_fhir_ingested_status(txn_id, b_id, status=True)

                if dynamo_update_result["status"] == "error":
                    logger.error(
                        f"Failed to update DynamoDB for b_id {b_id}, txn_id {txn_id}",
                        extra={"txn_id": txn_id, "b_id": b_id},
                        severity="medium",
                    )
            result["fhir_status"] = {
                "status": "success" if fhir_response.status_code == 200 else "error",
                "status_code": fhir_response.status_code,
                "response": fhir_response.text if fhir_response.text else {},
            }
        else:
            result["fhir_status"] = {
                "status": "error",
                "message": "eka_emr_template data not found in output.json",
            }

        logger.info(
            f"FHIR data processed for txn_id {txn_id}",
            extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id, "result": result},
            severity="medium",
        )
        return result

    except Exception as e:
        logger.error(
            f"Error processing FHIR data for txn_id {txn_id}: {str(e)}",
            extra={"txn_id": txn_id, "b_id": b_id, "c_id": c_id, "error": str(e)},
            exc_info=True,
            severity="critical",
        )
        return result
