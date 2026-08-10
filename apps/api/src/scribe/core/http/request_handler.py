"""
Request handler for extracting and validating request data.
"""
from typing import Dict, Any
import orjson
from fastapi import Request
from scribe.core.custom_logger import get_logger
from scribe.core.validation import extract_business_id_from_token

logger = get_logger(__name__)


class RequestHandler:
    """Handles request parsing and validation."""

    @staticmethod
    def extract_headers(request: Request, txn_id: str) -> Dict[str, Any]:
        """
        Extract relevant headers from the request.

        Args:
            request: FastAPI Request object
            txn_id: Transaction ID for logging

        Returns:
            Dict containing extracted headers
        """
        headers = {
            "token_data": {},
            "flavour": "",
            "version": "",
            "sdk_version": "",
            "paid_user": False,
            "amazon_trace_id": "",
        }

        amzn_trace_id = ""
        amzn_cf_id = ""

        for key, value in request.headers.items():
            key_lower = key.lower()

            if key_lower == "x-amzn-trace-id":
                amzn_trace_id = value
                logger.info(
                    f"Extracted Amazon Trace ID: {value}",
                    txn_id=txn_id,
                )

            elif key_lower == "x-amz-cf-id":
                amzn_cf_id = value
                logger.info(
                    f"Extracted Amazon CF ID: {value}",
                    txn_id=txn_id,
                )

            elif key_lower == "jwt-payload":
                jwt_data = orjson.loads(value)
                headers["token_data"] = jwt_data
                logger.info(
                    "Extracted JWT payload from headers",
                    txn_id=txn_id,
                )

                # Extract paid user status
                claims = jwt_data.get("cc", {})
                try:
                    if isinstance(claims, dict):
                        headers["paid_user"] = claims.get("esc", 0) == 1
                    else:
                        claims = orjson.loads(claims)
                        headers["paid_user"] = claims.get("esc", 0) == 1
                except Exception as e:
                    logger.error(f"Error processing 'cc' header: {str(e)}", severity="critical")

            elif key_lower == "flavour":
                headers["flavour"] = value
            elif key_lower == "version":
                headers["version"] = value
            elif key_lower == "sdk-version":
                headers["sdk_version"] = value

        if amzn_cf_id or amzn_trace_id:
            headers["amazon_trace_id"] = amzn_cf_id or amzn_trace_id

        return headers

    @staticmethod
    def extract_business_id_from_request(request: Request) -> str:
        """
        Extract business ID from JWT payload in request headers.
        Args:
            request: FastAPI Request object

        Returns:
            Business ID

        Raises:
            BusinessIdRequiredException: If business ID not found
        """
        for key, value in request.headers.items():
            if key.lower() == "jwt-payload":
                token_data = orjson.loads(value)
                return extract_business_id_from_token(token_data)

        # If no JWT payload found, raise exception
        from scribe.core.exceptions import BusinessIdRequiredException
        raise BusinessIdRequiredException()

    @staticmethod
    def extract_token_data_from_request(request: Request) -> Dict[str, Any]:
        """
        Extract JWT token data from request headers.

        Args:
            request: FastAPI Request object

        Returns:
            Token data dict
        """
        for key, value in request.headers.items():
            if key.lower() == "jwt-payload":
                return orjson.loads(value)
        return {}
    
    @staticmethod
    def is_connect_client(request: Request) -> tuple[bool, str]:
        """
        Check if the client is a connect client.
        Args:
            request: FastAPI Request object

        Returns:
            Tuple containing True if the client is a connect client, False otherwise and the client ID
        """
        token_data = RequestHandler.extract_token_data_from_request(request)
        if token_data.get("c-id"):
            return True, token_data.get("c-id")
        return False, None

