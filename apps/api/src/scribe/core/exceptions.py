"""
Custom exceptions for voice2rx application.
"""
from typing import Optional
MODEL_ERROR_MESSAGE = (
    "Something went wrong while generating the response. Please try again."
)


class Voice2RxException(Exception):
    def __init__(
        self,
        message: str,
        code: str = "internal_error",
        status_code: int = 500,
        details: Optional[dict] = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class TransactionNotFoundException(Voice2RxException):
    def __init__(self, txn_id: str, b_id: str):
        super().__init__(
            message="Transaction not found",
            code="transaction_not_found",
            status_code=404,
            details={"txn_id": txn_id, "b_id": b_id},
        )


class BusinessIdRequiredException(Voice2RxException):
    def __init__(self):
        super().__init__(
            message="Business ID is required",
            code="business_id_required",
            status_code=400,
        )


class ValidationException(Voice2RxException):
    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(
            message=message,
            code="validation_error",
            status_code=400,
            details={"field": field} if field else {},
        )


class DatabaseException(Voice2RxException):
    def __init__(self, message: str, operation: str):
        super().__init__(
            message=f"Database {operation} failed: {message}",
            code="database_error",
            status_code=500,
            details={"operation": operation},
        )


class S3UrlRequiredException(Voice2RxException):
    def __init__(self, url_type: str):
        super().__init__(
            message=f"{url_type} URL is required",
            code=f"{url_type.lower().replace(' ', '_')}_required",
            status_code=400,
        )


class DuplicateTransactionException(Voice2RxException):
    def __init__(self, txn_id: str):
        super().__init__(
            message="Transaction already initialized",
            code="txn_already_initialized",
            status_code=409,
            details={"txn_id": txn_id},
        )

class TemplateProcessingException(Voice2RxException):
    def __init__(self, message: str, txn_id: str):
        super().__init__(
            message=message,
            code="template_processing_exception",
            status_code=400,
            details={"txn_id": txn_id},
        )

class SystemFailureException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="system_failure",
            status_code=500,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class RequestFailureException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="request_failure",
            status_code=400,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class ResourceNotFoundException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="resource_not_found",
            status_code=404,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class CancelledException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="cancelled",
            status_code=400,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class ActiveSessionException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="active_session",
            status_code=400,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class DomainRequiredException(Voice2RxException):
    def __init__(self):
        super().__init__(
            message="Domain is required",
            code="domain_required",
            status_code=400,
        )

class InvalidRequestException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="invalid_request",
            status_code=400,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class DuplicateEntryException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="duplicate_entry",
            status_code=400,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class DatabaseInsertionException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="database_insertion_error",
            status_code=500,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class PermissionDeniedException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="permission_denied",
            status_code=403,
            details={"txn_id": txn_id, "b_id": b_id},
        )

class BadRequestException(Voice2RxException):
    def __init__(self, message: str, txn_id: str = None, b_id: str = None):
        super().__init__(
            message=message,
            code="bad_request",
            status_code=400,
            details={"txn_id": txn_id, "b_id": b_id},
        )  

class TiptapJsonNotFound(Voice2RxException):
    def __init__(self, document_id: str):
        super().__init__(
            message=f"TipTap JSON not found for document_id={document_id!r}",
            code="tiptap_not_found",
            status_code=404,
            details={"document_id": document_id},
        )


class InvalidTiptapJson(Voice2RxException):
    def __init__(self, message: str):
        super().__init__(
            message=message,
            code="invalid_tiptap_json",
            status_code=400,
        )