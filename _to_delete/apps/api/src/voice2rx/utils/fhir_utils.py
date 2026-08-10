import base64
import orjson
import requests

def fetch_intermediate_fhir_result(session_id: str):
    """
    Fetches the Intermediate FHIR result for a given session ID from the FHIR processor.
    """

    url = f"http://deepthought.orbi.orbi/api/v1/fetch_fhir_data/{session_id}"

    payload = {}
    headers = {}

    response = requests.request("GET", url, headers=headers, data=payload)

    if response.status_code == 200:
        response_data = response.json()
        response_bytes = orjson.dumps(response_data)
        return base64.b64encode(response_bytes).decode()
    return ""