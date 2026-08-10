import traceback
from fastapi.responses import JSONResponse
from fastapi import HTTPException
from functools import wraps
from typing import Dict, Any, Callable
from scribe.core.custom_logger import get_logger
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

logger = get_logger(__name__)

ERROR_CODES = {
    400: "BAD_REQUEST",
    401: "BAD_REQUEST",   
    403: "BAD_REQUEST",   
    404: "BAD_REQUEST",   
    409: "BAD_REQUEST",   
    422: "BAD_REQUEST",   
    500: "INTERNAL_SERVER_ERROR"
}

def handle_exception(e, response):
    traceback.print_exc()
    response["status"] = "failed"
    if hasattr(e, "response") and e.response["Error"]["Code"] == "404":
        response["status"] = "queued"
        return JSONResponse(response, status_code=202)
    return JSONResponse(response, status_code=500)

def create_error_response(error_code: str, message: str, status_code: int = 500) -> JSONResponse:
    """Create standardized error response"""
    if 400 <= status_code < 500:
        status_code = 400
        error_code = "BAD_REQUEST"
    elif status_code >= 500:
        status_code = 500
        error_code = "INTERNAL_SERVER_ERROR"
    
    return JSONResponse(
        content={
            "error": {
                "code": error_code,
                "message": message
            }
        },
        status_code=status_code
    )

def handle_template_errors(func: Callable) -> Callable:
    """Decorator to handle errors in template service methods"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException as e:
            # All 4XX errors become 400, 5XX stay 500
            final_status = 400 if 400 <= e.status_code < 500 else 500
            error_code = "BAD_REQUEST" if final_status == 400 else "INTERNAL_SERVER_ERROR"
            
            logger.error(f"HTTPException in {func.__name__}: {e.detail}", severity="medium")
            return create_error_response(error_code, str(e.detail), final_status)
        except ValueError as e:
            logger.error(f"ValueError in {func.__name__}: {str(e)}", severity="medium")
            return create_error_response("BAD_REQUEST", str(e), 400)
        except KeyError as e:
            logger.error(f"KeyError in {func.__name__}: {str(e)}", severity="medium")
            return create_error_response("BAD_REQUEST", f"Required field missing: {str(e)}", 400)
        except Exception as e:
            logger.error(f"Unexpected error in {func.__name__}: {str(e)}\n{traceback.format_exc()}", severity="critical")
            return create_error_response("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500)
    
    return wrapper

def handle_template_service_errors(func: Callable) -> Callable:
    """Decorator specifically for template service methods (non-async)"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except HTTPException as e:
            # Re-raise HTTPException to be caught by API decorator
            raise e
        except ValueError as e:
            logger.error(f"ValueError in {func.__name__}: {str(e)}", severity="medium")
            raise HTTPException(status_code=400, detail=str(e))
        except KeyError as e:
            logger.error(f"KeyError in {func.__name__}: {str(e)}", severity="medium")
            raise HTTPException(status_code=400, detail=f"Required field missing: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in {func.__name__}: {str(e)}\n{traceback.format_exc()}", severity="critical")
            raise HTTPException(status_code=500, detail="An unexpected error occurred")
    
    return wrapper

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle Pydantic validation errors from FastAPI"""
    logger.error(f"Validation error on {request.url}: {exc.errors()}", severity="medium")
    
    # Extract the first error for simplicity
    first_error = exc.errors()[0] if exc.errors() else {}
    field_name = " -> ".join(str(loc) for loc in first_error.get("loc", []))
    error_msg = first_error.get("msg", "Validation failed")
    
    return create_error_response(
        "BAD_REQUEST", 
        f"Field '{field_name}': {error_msg}", 
        400 
    )

async def pydantic_validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Handle direct Pydantic validation errors"""
    logger.error(f"Pydantic validation error on {request.url}: {exc.errors()}", severity="medium")
    
    first_error = exc.errors()[0] if exc.errors() else {}
    field_name = " -> ".join(str(loc) for loc in first_error.get("loc", []))
    error_msg = first_error.get("msg", "Validation failed")
    
    return create_error_response(
        "BAD_REQUEST", 
        f"Field '{field_name}': {error_msg}", 
        400 
    )