from fastapi import APIRouter

from .transaction_actions import transaction_actions_router

# Session lifecycle happens via the protocol sessions API (/voice/v1/sessions).
# The only v2 surface kept is the PATCH callback the pipeline drives.
transaction_router = APIRouter()
transaction_router.include_router(transaction_actions_router)
