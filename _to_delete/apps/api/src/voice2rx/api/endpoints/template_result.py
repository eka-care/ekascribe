from fastapi import APIRouter, Request, status, BackgroundTasks
from logs.custom_logger import get_logger

from voice2rx.api.endpoints.transactions.handlers import (
    RequestHandler,
    ResponseFormatter,
)
from voice2rx.services.templates import template_result_common
from voice2rx.api.schemas.template_schema import TemplateRequestData
from voice2rx.services.templates.conversion_pipeline import (
    ConversionContext,
    ConversionPipeline,
)
from voice2rx.services.templates.input_preparers import (
    EkaEmrInputPreparer,
    IntegrationTemplateInputPreparer,
    TemplateInputPreparer,
    TranscriptInputPreparer,
    TranslationInputPreparer,
)
from voice2rx.utils.constants import exculuded_apps


template_result_router = APIRouter()
logger = get_logger(__name__)

pipeline = ConversionPipeline()

@template_result_router.post("/{txn_id}/convert-to-template")
async def generate_template_result_integration(
    txn_id: str,
    request_data: TemplateRequestData,
    request: Request,
    background_tasks: BackgroundTasks = None,
):
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        if not request_data.transcript and not request_data.target_language:
            return ResponseFormatter.error(
                code="invalid_request",
                message="Either transcript or target_language must be provided",
                txn_id=txn_id,
                b_id=b_id,
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        
        transaction_data = template_result_common.transaction_repo.get_transaction(
            txn_id, b_id
        )

        # clients like web, desktop only upload the transcript and they run the AG-ui or other flow to convert
        #  the result from the uploaded transcript. this API should only upload the transcript 

        # but for the other clients like extension and other it does both the things , it uploads the transcripts 
        #   and also it run the background agent to generate the given templates.
        flavour = request.headers.get("flavour", "")
        if (
            request_data.transcript
            and not request_data.template_id
            and not request_data.target_language
            and flavour
            in exculuded_apps
        ):
            background_tasks.add_task(
                upload_transcript_in_background,
                txn_id=txn_id,
                b_id=b_id,
                transcript_text=request_data.transcript,
                transaction_data=transaction_data,
            )
            logger.info(
                "Direct transcript-only upload started in background",
                txn_id=txn_id,
                b_id=b_id,
                flavour=flavour,
            )
            return ResponseFormatter.success(
                message="Transcript upload started in background",
                txn_id=txn_id,
                b_id=b_id,
                additional_data={"status": "in-progress"},
                status_code=202,
            )

        if request_data.target_language and not request_data.template_id:
            template_id = f"transcript_{request_data.target_language}"
            request_data.template_id = template_id

        logger.info(
            "Processing convert-to-template request",
            txn_id=txn_id,
            b_id=b_id,
            template_id=request_data.template_id,
            has_transcript=bool(request_data.transcript),
            has_target_language=bool(request_data.target_language),
        )

        # determin document type, lang translitration flow
        is_transcript_flow = bool(request_data.target_language)
        # create document (in-progress) and return immediately
        check_result = template_result_common.check_and_initialize_documents(
            txn_id=txn_id,
            template_id=request_data.template_id,
            b_id=b_id,
            transcript=is_transcript_flow,
            transaction_data=transaction_data,
        )

        if not request_data.template_id:
            template_id = check_result.get("template_id")
            request_data.template_id = template_id

        if not check_result["should_continue"]:
            return check_result["response"]

        document_id = check_result.get("document_id")

        # schedule background conversion
        background_tasks.add_task(
            generate_template_in_background,
            txn_id=txn_id,
            template_id=request_data.template_id,
            b_id=b_id,
            document_id=document_id,
            transcript_text=(
                request_data.transcript if request_data.transcript else None
            ),
            target_language=(
                request_data.target_language if request_data.target_language else None
            ),
            transaction_data = transaction_data
        )

        return ResponseFormatter.success(
            message="Template generation started in background",
            txn_id=txn_id,
            b_id=b_id,
            additional_data={
                "template_id": request_data.template_id,
                "document_id": document_id,
                "status": "in-progress",
            },
            status_code=202,
        )

    except Exception as e:
        logger.critical(
            "Error in generate_template_result_integration",
            txn_id=txn_id,
            b_id=b_id if "b_id" in locals() else None,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.from_exception(
            e, txn_id=txn_id, b_id=b_id if "b_id" in locals() else None
        )


@template_result_router.post("/{txn_id}/convert-to-template/{template_id}")
async def generate_template_result(
    txn_id: str,
    template_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    language: str = None,
):
    try:
        b_id = RequestHandler.extract_business_id_from_request(request)
        logger.info(
            "Processing template result generation request",
            txn_id=txn_id,
            b_id=b_id,
            template_id=template_id,
        )
        transaction_data = template_result_common.transaction_repo.get_transaction(
            txn_id, b_id
        )

        check_result = template_result_common.check_and_initialize_documents(
            txn_id=txn_id,
            template_id=template_id,
            b_id=b_id,
            transaction_data=transaction_data,
        )

        if not check_result["should_continue"]:
            return check_result["response"]

        document_id = check_result.get("document_id")
        background_tasks.add_task(
            generate_template_in_background,
            txn_id=txn_id,
            template_id=template_id,
            b_id=b_id,
            document_id=document_id,
            transaction_data=transaction_data
        )

        logger.info(
            "Template generation started in background",
            txn_id=txn_id,
            b_id=b_id,
            template_id=template_id,
        )

        return ResponseFormatter.success(
            message="Template generation in progress",
            txn_id=txn_id,
            b_id=b_id,
            additional_data={
                "template_id": template_id,
                "document_id": document_id,
                "status": "in-progress",
            },
            status_code=202,
        )

    except Exception as e:
        logger.critical(
            "Error in generate_template_result",
            txn_id=txn_id,
            b_id=b_id if "b_id" in locals() else None,
            template_id=template_id,
            error=str(e),
            exc_info=True,
            severity="critical",
        )
        return ResponseFormatter.error(
            code="unexpected_error",
            message="An unexpected error occurred",
            txn_id=txn_id,
            b_id=b_id if "b_id" in locals() else "",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_details=str(e),
        )


async def upload_transcript_in_background(
    txn_id: str,
    b_id: str,
    transcript_text: str,
    transaction_data: dict,
):
    ctx = ConversionContext(
        txn_id=txn_id,
        template_id="transcript",
        b_id=b_id,
        document_id="",
        transaction_data=transaction_data,
    )
    preparer = TranscriptInputPreparer(transcript_text)
    try:
        await preparer.run_transcript_upload(ctx)
    except Exception as e:
        logger.critical(
            "Direct transcript-only upload failed",
            txn_id=txn_id,
            b_id=b_id,
            error=str(e),
            exc_info=True,
            severity="critical",
        )


async def generate_template_in_background(
    txn_id: str,
    template_id: str,
    b_id: str,
    document_id: str,
    transaction_data : dict,
    transcript_text: str = None,
    target_language: str = None,
):
    ctx = ConversionContext(
        txn_id=txn_id,
        template_id=template_id,
        b_id=b_id,
        document_id=document_id,
        transaction_data=transaction_data,
    )
    if template_id == "eka_emr_template":
        preparer = EkaEmrInputPreparer()
    elif transcript_text:
        preparer = TranscriptInputPreparer(transcript_text)
    elif target_language:
        preparer = TranslationInputPreparer(target_language)
    else:
        preparer = TemplateInputPreparer()

    await pipeline.execute(ctx, preparer)


async def generate_integration_template_in_background(
    txn_id: str,
    template_id: str,
    b_id: str,
    document_id: str,
    transaction_data: dict,
    template_name: str = "",
):
    ctx = ConversionContext(
        txn_id=txn_id,
        template_id=template_id,
        b_id=b_id,
        document_id=document_id,
        transaction_data=transaction_data,
    )
    await pipeline.execute(ctx, IntegrationTemplateInputPreparer(template_name=template_name))
