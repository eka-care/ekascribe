import requests
import time
import os
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from logs.custom_logger import get_logger

logger = get_logger(__name__)

medical_record_router = APIRouter()

# Environment-based FHIR URL selection  
if os.getenv("CURR_ENV", "dev") == "dev":
    FHIR_BASE_URL = "http://health-repo.orbi.dev/internal/api/v1/fhir/o/resource/Composition"
else:
    FHIR_BASE_URL = "http://health-repo.orbi.orbi/internal/api/v1/fhir/o/resource/Composition"

DEFAULT_POLLING_DURATION = 15
DEFAULT_POLLING_INTERVAL = 2 


@medical_record_router.get("/health")
async def health_check():
    """Health check endpoint for medical record service"""
    return JSONResponse({"status": "healthy", "service": "medical-record-api"}, status_code=200)


@medical_record_router.get("/fhir/{txn_id}")
async def get_composition(
    txn_id: str
):
    """
    Get FHIR data for particular transaction Id with polling for 15 seconds total.
    If no result found within 15 seconds, returns data unavailable.
    """
    try:
        result = await fetch_fhir_composition(txn_id)
        if result['status'] == 'success':
            return JSONResponse(result, status_code=200)
        elif result['status'] == 'failed':
            return JSONResponse(result, status_code=408)  # Request Timeout
        else:
            return JSONResponse(result, status_code=400)
            
    except Exception as e:
        logger.error(f"Error in get_composition for txn_id {txn_id}: {str(e)}", txn_id=txn_id, exc_info=True)
        return JSONResponse({
            "status": "error",
            "message": f"Internal server error: {str(e)}"
        }, status_code=500)

async def fetch_fhir_composition(txn_id):
    """
    Fetch FHIR Composition with polling for 15 seconds total
    
    Args:
        txn_id: The transaction ID to fetch
    
    Returns:
        dict: Response data or data unavailable message
    """
    
    # Create system value and URL encode it
    # append P-PP- to the txn_id to match the expected format
    if not txn_id.startswith("P-PP-"):
        txn_id = f"P-PP-{txn_id}"
    system_value = f"https://parchi.eka.care|{txn_id}"
    encoded_url = quote(system_value, safe='')
    url = f"{FHIR_BASE_URL}/{encoded_url}"

    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    polling_duration = DEFAULT_POLLING_DURATION  
    poll_interval = DEFAULT_POLLING_INTERVAL  
    start_time = time.time()
    attempt = 0
    
    logger.info(f"FHIR composition request for txn_id == {txn_id}", txn_id=txn_id, url=url)
    
    
    while (time.time() - start_time) < polling_duration:
        attempt += 1
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            if "entry" in data and len(data["entry"]) > 0:
                logger.info(f"Successfully fetched FHIR composition on attempt {attempt} data == {data}", txn_id=txn_id)
                return {
                    "status": "success",
                    "data": data,
                    "txn_id": txn_id
                }
            else:
                time.sleep(poll_interval)

    logger.warning(f"No FHIR composition found on attempt {attempt} for txn_id: {txn_id}", txn_id=txn_id, url=url)
    return {
        "status": "failed",
        "message": f"Data unavailable",
        "txn_id": txn_id
    }