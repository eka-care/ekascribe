import logging
import os

import urllib.parse
import requests
import base64
import asyncio

import orjson

from datetime import datetime


log = logging.getLogger(__name__)

WHITELISTED_ERRORS = {"partial_output_transcription", "error_upload"}


class Voice2RxStatus:
    def __init__(self, bucket_name="voice-records"):
        from scribe_core.storage import get_blob_store

        self.store = get_blob_store()
        self.bucket_name = bucket_name

    def fetch_fhir_result(self, session_id):
        # NOTE(oss): eka-internal FHIR repo — stubbed behind config (plan decision #7).
        repo_base = os.getenv("EKA_FHIR_REPO_URL")
        if not repo_base:
            return ""
        system_value = f"https://parchi.eka.care|{session_id}"
        encoded_url = urllib.parse.quote(system_value, safe='')
        url = repo_base.rstrip("/") + "/internal/api/v1/fhir/o/resource/Composition/" + encoded_url
        headers  = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'service-id': 'deepthought'
        }

        response = requests.get(url=url, headers=headers)
        if response.status_code == 200:
            response = response.json()
            if response.get("entry"):
                json_str = orjson.dumps(response)
                return base64.b64encode(json_str).decode()
            
        return ""
    
    def download_s3_file(self, file_key, local_filename, session_id):
        """Helper function to download a file from S3."""
        try:
            content = self.store.get(self.bucket_name, file_key)
            return orjson.loads(content) if local_filename.endswith(".json") else content.decode("utf-8")
        except Exception as e:
            print(f"{file_key} not found for rx-id --> {session_id} :: error {e}")
            return None
    
    def fetch_voice2rx_data(self, profile_data, session_id, response, meta_data={}):
        file_path = self.get_file_path(profile_data, session_id, meta_data)
        total_resources = 0
        total_parsed_resources = 0
        markdown_content = None

        # Clinical summary notes
        if meta_data.get("is_custom"):
            markdown_content = self.download_s3_file(f"{file_path}/clinical_notes_summary.md", "clinical_notes_summary.md", session_id)
        
        # Errors
        voice2rx_errors = self.download_s3_file(f"{file_path}/errors.txt", "errors.txt", session_id)
        if voice2rx_errors:
            print("voice2rx errors ", voice2rx_errors)

            partially_processed = False
            error_encountered = False
            voice2rx_errors = orjson.loads(voice2rx_errors)

            for key, values in voice2rx_errors.items():
                if isinstance(values, bool): # to handle 'is_completed' field
                    continue
                if key == "parsed_resources":
                    total_parsed_resources = values
                    continue
                elif key == "total_resources":
                    total_resources = values
                    continue
                for rx_error in values:
                    if rx_error.get("code") in WHITELISTED_ERRORS:
                        response["error"] = {
                            "code": rx_error.get("code", ""),
                            "message": rx_error.get("message", ""),
                            "display_message": rx_error.get("message", ""),
                        }
                    if rx_error.get("code").startswith("error"):
                        error_encountered = True
                    elif rx_error.get("code").startswith("partial"):
                        partially_processed = True

            if error_encountered:
                response["status"] = "error"
            elif partially_processed:
                response["status"] = "partial_completed"
            elif voice2rx_errors.get("is_completed", False):
                response["status"] = "completed"
            else:
                response["status"] = "inprogress"

        # output file
        output_file = self.download_s3_file(f"{file_path}/output.json", "output.json", session_id)
        if output_file:
            response["data"]["output"].update(output_file)

        # Fhir output
        fhir_output = self.download_s3_file(f"{file_path}/fhir.json", "fhir.json", session_id)
        if fhir_output:
            if fhir_output.get("entry"):
                json_str = orjson.dumps(fhir_output)
                response["data"]["output"]["fhir"] = base64.b64encode(json_str).decode()
          
        return response, total_resources, total_parsed_resources, markdown_content
 
    def get_file_path(self, profile_data: dict, session_data: str, meta_data: dict) -> str:
        """
        Constructs a file path based on profile data hierarchy.
        
        Args:
            profile_data (dict): Dictionary containing c_id, b_id, and uuid
            session_data (str): Session information to append to the path
            
        Returns:
            str: Constructed file path with components joined by '/'
        """
        path_components = []
        if meta_data.get("date", ""):
            dt = datetime.fromisoformat(meta_data.get("date").rstrip("Z"))
            path_components.append(dt.strftime("%y%m%d"))

        else:
            if c_id := profile_data.get("c_id"):
                path_components.append(c_id)
                
                if b_id := profile_data.get("b_id"):
                    path_components.append(b_id)
                elif uuid := profile_data.get("uuid"):
                    path_components.append(uuid)

            elif b_id := profile_data.get("b_id"):
                path_components.append(b_id)
        
        path_components.append(session_data)
        
        return '/'.join(path_components)

        try:
            response = {
                "status": "",
                "error": {},
                "data": {
                    "output": {"fhir": {}}
                }
            }
            
            profile_data = {
                "uuid": request.get("user", {}).get("user_uuid", ""),
                "b_id": request.get("user", {}).get("b_id", ""),
                "c_id": request.get("user", {}).get("c_id", "")
            }

            response, total_resources, total_parsed_resources, markdown_content = self.fetch_voice2rx_data(
                profile_data, session_id, response, {"is_custom": True, "date": date}
            )

            response["data"]["meta_data"] = {
                    "total_resources": total_resources,
                    "total_parsed_resources": total_parsed_resources
                }
            return response, markdown_content
        except Exception as e:
            print(f"Unable to access S3 data for rx-id --> {session_id}")
            return None, None