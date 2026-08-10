from fastapi import APIRouter
from .metrics import txn_metrics_router


metrics_router = APIRouter()

metrics_router.include_router(txn_metrics_router)
