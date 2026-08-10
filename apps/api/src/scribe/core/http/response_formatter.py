"""
Response formatter for creating standardized API responses.
"""
from typing import Optional, Dict, Any
from fastapi.responses import JSONResponse

from scribe.repositories.transaction_orm import convert_decimals


class ResponseFormatter:
    """Formats API responses in a standardized way."""

    @staticmethod
    def success(
        message: str,
        txn_id: str,
        b_id: str,
        additional_data: Optional[Dict[str, Any]] = None,
        status_code: int = 200,
    ) -> JSONResponse:
        """
        Create a success response.

        Args:
            message: Success message
            txn_id: Transaction ID
            b_id: Business ID
            additional_data: Optional additional data to include
            status_code: HTTP status code

        Returns:
            JSONResponse
        """
        response_data = {
            "status": "success",
            "message": message,
            "txn_id": txn_id,
            "b_id": b_id,
        }

        if additional_data:
            response_data.update(additional_data)

        return JSONResponse(content=response_data, status_code=status_code)

    @staticmethod
    def error(
        code: str,
        message: str,
        txn_id: str = "",
        b_id: str = "",
        status_code: int = 400,
        error_details: Optional[str] = None,
    ) -> JSONResponse:
        """
        Create an error response.

        Args:
            code: Error code
            message: Error message
            txn_id: Transaction ID
            b_id: Business ID
            status_code: HTTP status code
            error_details: Optional detailed error information

        Returns:
            JSONResponse
        """
        return JSONResponse(
            {
                "status": "failed",
                "error": {
                    "code": code,
                    "message": message or error_details,
                    "display_message": message,
                },
                "txn_id": txn_id,
                "b_id": b_id,
            },
            status_code=status_code,
        )

    @staticmethod
    def from_exception(
        exception: Exception,
        txn_id: str = "",
        b_id: str = "",
    ) -> JSONResponse:
        """
        Create error response from an exception.

        Args:
            exception: Exception object
            txn_id: Transaction ID
            b_id: Business ID

        Returns:
            JSONResponse
        """
        from scribe.core.exceptions import Voice2RxException
        if isinstance(exception, Voice2RxException):
            return ResponseFormatter.error(
                code=exception.code,
                message=exception.message,
                txn_id=txn_id,
                b_id=b_id,
                error_details=exception.details,
                status_code=exception.status_code,
            )

        # Generic exception handling, fallback to internal server error.
        return ResponseFormatter.error(
            code="unexpected_error",
            message="An unexpected error occurred",
            txn_id=txn_id,
            b_id=b_id,
            status_code=500,
            error_details=str(exception),
        )

    @staticmethod
    def json_response(data: dict, status_code: int = 200) -> JSONResponse:
        """
        Create a JSON response.
        Args:
            data: Data to include in the response
            status_code: HTTP status code

        Returns:
            JSONResponse
        """
        data = convert_decimals(data)
        return JSONResponse(content=data, status_code=status_code)
