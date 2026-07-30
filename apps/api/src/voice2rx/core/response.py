"""
Standardized API response formatters.
"""
from typing import Any, Dict, Optional
from fastapi.responses import JSONResponse


class APIResponse:
    """Factory for creating standardized API responses."""

    @staticmethod
    def success(
        message: str,
        txn_id: str,
        b_id: str,
        data: Optional[Dict[str, Any]] = None,
        status_code: int = 200,
    ) -> JSONResponse:
        """Create a successful response."""
        response_data = {
            "status": "success",
            "message": message,
            "txn_id": txn_id,
            "b_id": b_id,
        }
        if data:
            response_data.update(data)

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
        """Create an error response."""
        return JSONResponse(
            {
                "status": "failed",
                "error": {
                    "code": code,
                    "message": error_details or message,
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
        """Create error response from a Voice2RxException."""
        from .exceptions import Voice2RxException

        if isinstance(exception, Voice2RxException):
            return APIResponse.error(
                code=exception.code,
                message=exception.message,
                txn_id=txn_id,
                b_id=b_id,
                status_code=exception.status_code,
            )
        
        # Generic exception handling
        return APIResponse.error(
            code="unexpected_error",
            message="An unexpected error occurred",
            txn_id=txn_id,
            b_id=b_id,
            status_code=500,
            error_details=str(exception),
        )


# Alias for backward compatibility
class ErrorResponse(APIResponse):
    """Deprecated: Use APIResponse.error() instead."""
    pass

