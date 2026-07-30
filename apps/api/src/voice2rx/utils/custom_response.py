import logging
from fastapi.responses import JSONResponse
from pydantic import ValidationError


def create_error_response(code: str, message: str, status_code: int = 400) -> JSONResponse:
    
    response_data = {
        "status": "failed",
        "error": {
            "code": code,
            "message": message,
            "display_message": message
        }
    }
    
    return JSONResponse(
        response_data,
        status_code=status_code,
    )
    

def format_validation_error(validation_error, error_code: str = "VALIDATION_ERROR", status_code: int = 400) -> JSONResponse:
    """
    Format Pydantic ValidationError to custom error structure
    """
    # Handle Pydantic ValidationError
    if isinstance(validation_error, ValidationError):
        error_messages = []
        for error in validation_error.errors():
            field = ".".join(str(loc) for loc in error["loc"]) if error["loc"] else "root"
            message = error["msg"]
            error_messages.append(f"{field}: {message}")
        message = "; ".join(error_messages)
    else:
        message = str(validation_error)
    
    response_data = {
        "status": "failed",
        "error": {
            "code": error_code,
            "message": message,
            "display_message": "Please check your input data and try again."
        }
    }
    
    return JSONResponse(
        response_data,
        status_code=status_code,
    )


def format_generic_error(error, error_code: str = "INTERNAL_ERROR", status_code: int = 500) -> JSONResponse:
    """
    Format generic error to custom error structure
    """
    response_data = {
        "status": "failed",
        "error": {
            "code": error_code,
            "message": str(error),
            "display_message": "An error occurred while processing your request."
        }
    }

    return JSONResponse(
        response_data,
        status_code=status_code,
    )