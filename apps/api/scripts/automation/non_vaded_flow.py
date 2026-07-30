"""
Voice2Rx Non-VADED Flow Automation Script

This script automates the complete non-VADED flow using public APIs:
1. Login API to get access token
2. Get presigned URL for S3 upload
3. Upload audio file to S3
4. Init transaction API with non-vaded transfer type
5. Poll result API until completion (202 -> 200)

Usage:
    python non_vaded_flow.py --client-id <id> --client-secret <secret>
    python non_vaded_flow.py --client-id <id> --client-secret <secret> --file-path /path/to/audio.mp3
"""

import requests
import json
import time
import os
import sys
import argparse
import base64
from typing import Dict, Any, Optional


class Config:
    """Configuration for the non-VADED flow"""
    
    # API Endpoints
    BASE_URL = "https://api.eka.care"
    LOGIN_URL = f"{BASE_URL}/connect-auth/v1/account/login"
    PRESIGNED_URL_ENDPOINT = f"{BASE_URL}/v1/file-upload"
    INIT_API_URL = f"{BASE_URL}/voice/api/v2/transaction/init"
    STATUS_API_URL = f"{BASE_URL}/voice/api/v3/status"
    
    # Default audio file path
    DEFAULT_AUDIO_FILE = os.path.expanduser("~/Downloads/nonvaded/non_vaded.mp3")
    
    # Polling configuration
    POLL_INTERVAL = 5  # seconds
    MAX_POLL_ATTEMPTS = 120  # 10 minutes max
    
    # Default init payload configuration
    DEFAULT_MODE = "dictation"
    DEFAULT_INPUT_LANGUAGE = ["en-IN"]
    DEFAULT_OUTPUT_LANGUAGE = "en-IN"
    DEFAULT_SPECIALITY = "general_medicine"
    DEFAULT_TEMPLATE_ID = "eka_emr_template"


class Voice2RxNonVadedClient:
    """Client for Voice2Rx Non-VADED flow with public APIs"""
    
    def __init__(self, client_id: str, client_secret: str, api_key: Optional[str] = None, 
                 user_token: Optional[str] = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_key = api_key
        self.user_token = user_token
        self.access_token = None
        self.refresh_token = None
        self.txn_id = None
        self.s3_folder_path = None
    
    def login(self) -> Dict[str, Any]:
        print(f"\n{'='*80}")
        print("STEP 1: Authentication - Getting Access Token")
        print(f"{'='*80}")
        
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret
        }
        
        if self.api_key:
            payload["api_key"] = self.api_key
        if self.user_token:
            payload["user_token"] = self.user_token
        
        headers = {
            'Content-Type': 'application/json'
        }
        
        print(f"URL: {Config.LOGIN_URL}")
        print(f"Payload: {json.dumps({**payload, 'client_secret': '***'}, indent=2)}")
        
        try:
            response = requests.post(Config.LOGIN_URL, headers=headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            
            print("\n Login successful!")
            print(f"Access Token: {self.access_token[:20]}...")
            print(f"Expires In: {data.get('expires_in')} seconds")
            
            return data
            
        except requests.exceptions.RequestException as e:
            print(f"\n✗ Login failed: {str(e)}")
            if hasattr(e.response, 'text'):
                print(f"Response: {e.response.text}")
            raise
    
    def get_presigned_url(self, action: str = "ekascribe-v2") -> Dict[str, Any]:
        print(f"\n{'='*80}")
        print("STEP 2: Getting Presigned URL for S3 Upload")
        print(f"{'='*80}")
        
        if not self.access_token:
            raise Exception("Access token not available. Please login first.")
        
        url = f"{Config.PRESIGNED_URL_ENDPOINT}?action={action}"
        headers = {
            'Authorization': f'Bearer {self.access_token}'
        }
        
        print(f"URL: {url}")
        print(f"Action: {action}")
        
        try:
            response = requests.post(url, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            self.txn_id = data.get("txn_id")
            self.s3_folder_path = data.get("folderPath")
            
            print("\n Presigned URL received!")
            print(f"Transaction ID: {self.txn_id}")
            print(f"Folder Path: {self.s3_folder_path}")
            print(f"Upload URL: {data.get('uploadData', {}).get('url')}")
            
            return data
            
        except requests.exceptions.RequestException as e:
            print(f"\n✗ Failed to get presigned URL: {str(e)}")
            if hasattr(e.response, 'text'):
                print(f"Response: {e.response.text}")
            raise
    
    def upload_file_to_s3(self, upload_data: Dict[str, Any], folder_path: str, 
                          file_path: str) -> Dict[str, Any]:
        """
        Step 3: Upload audio file to S3 using presigned URL
        """
        print(f"\n{'='*80}")
        print("STEP 3: Uploading Audio File to S3")
        print(f"{'='*80}")
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        
        file_name = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        
        print(f"File: {file_path}")
        print(f"File Name: {file_name}")
        print(f"File Size: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
        
        # Update the key with actual filename
        upload_fields = upload_data['fields'].copy()
        upload_fields['key'] = folder_path + file_name
        
        print(f"S3 Key: {upload_fields['key']}")
        print(f"Upload URL: {upload_data['url']}")
        
        try:
            with open(file_path, 'rb') as file:
                files = {'file': (file_name, file)}
                response = requests.post(
                    upload_data['url'],
                    data=upload_fields,
                    files=files
                )
            
            # S3 returns 204 No Content on successful upload
            if response.status_code == 204:
                print("\n File uploaded successfully!")
                return {
                    'key': upload_fields['key'],
                    'size': file_size,
                    'status': 'success'
                }
            else:
                print(f"\n✗ Upload failed with status: {response.status_code}")
                print(f"Response: {response.text}")
                raise Exception(f"Upload failed: {response.status_code}")
                
        except Exception as e:
            print(f"\n✗ Upload failed: {str(e)}")
            raise
    
    def init_transaction(self, batch_s3_url: str, additional_data: Optional[Dict] = None,
                        mode: str = Config.DEFAULT_MODE,
                        input_language: list = None,
                        output_language: str = Config.DEFAULT_OUTPUT_LANGUAGE,
                        speciality: str = Config.DEFAULT_SPECIALITY,
                        template_id: str = Config.DEFAULT_TEMPLATE_ID,
                        codification_needed: bool = False) -> Dict[str, Any]:
        print(f"\n{'='*80}")
        print("STEP 4: Initializing Transaction")
        print(f"{'='*80}")
        
        if not self.access_token:
            raise Exception("Access token not available. Please login first.")
        
        if not self.txn_id:
            raise Exception("Transaction ID not available. Please get presigned URL first.")
        
        url = f"{Config.INIT_API_URL}/{self.txn_id}"
        
        if input_language is None:
            input_language = Config.DEFAULT_INPUT_LANGUAGE
        
        payload = {
            "mode": mode,
            "input_language": input_language,
            "output_language": output_language,
            "speciality": speciality,
            "output_format_template": [
                {
                    "template_id": template_id,
                    "codification_needed": codification_needed
                }
            ],
            "transfer": "non-vaded",
            "batch_s3_url": batch_s3_url
        }
        
        if additional_data:
            payload["additional_data"] = additional_data
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        print(f"URL: {url}")
        print(f"Transaction ID: {self.txn_id}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            print("\n Transaction initialized successfully!")
            print(f"Response: {json.dumps(data, indent=2)}")
            
            return data
            
        except requests.exceptions.RequestException as e:
            print(f"\n✗ Init transaction failed: {str(e)}")
            if hasattr(e.response, 'text'):
                print(f"Response: {e.response.text}")
            raise
    
    def get_status(self) -> requests.Response:
        if not self.access_token:
            raise Exception("Access token not available. Please login first.")
        
        if not self.txn_id:
            raise Exception("Transaction ID not available.")
        
        url = f"{Config.STATUS_API_URL}/{self.txn_id}"
        headers = {
            'Authorization': f'Bearer {self.access_token}'
        }
        
        response = requests.get(url, headers=headers)
        return response
    
    def poll_result(self) -> Dict[str, Any]:
        print(f"\n{'='*80}")
        print("STEP 5: Polling for Results")
        print(f"{'='*80}")
        print(f"Transaction ID: {self.txn_id}")
        print(f"Poll Interval: {Config.POLL_INTERVAL} seconds")
        print(f"Max Attempts: {Config.MAX_POLL_ATTEMPTS}")
        
        attempt = 0
        start_time = time.time()
        
        while attempt < Config.MAX_POLL_ATTEMPTS:
            attempt += 1
            elapsed = time.time() - start_time
            
            print(f"\nAttempt {attempt}/{Config.MAX_POLL_ATTEMPTS} (Elapsed: {elapsed:.1f}s)...", 
                  end=' ')
            
            try:
                response = self.get_status()
                status_code = response.status_code
                
                print(f"Status: {status_code}")
                
                if status_code == 200:
                    print("\n Transaction completed successfully!")
                    print("\n" + "="*80)
                    print("FINAL RESULT")
                    print("="*80)
                    
                    result = response.json()
                    print(json.dumps(result, indent=2))
                    
                    self._decode_template_values(result)
                    
                    return result
                
                elif status_code == 202:
                    print(" Still processing...")
                    time.sleep(Config.POLL_INTERVAL)
                
                else:
                    print(f"\nUnexpected status code: {status_code}")
                    print(f"Response: {response.text}")
                    raise Exception(f"Unexpected status code: {status_code}")
                
            except requests.exceptions.RequestException as e:
                print(f"\nError polling status: {str(e)}")
                if hasattr(e.response, 'text'):
                    print(f"Response: {e.response.text}")
                
                if attempt < Config.MAX_POLL_ATTEMPTS:
                    print(f" Retrying in {Config.POLL_INTERVAL} seconds...")
                    time.sleep(Config.POLL_INTERVAL)
                else:
                    raise
        
        elapsed = time.time() - start_time
        raise Exception(
            f"Max polling attempts ({Config.MAX_POLL_ATTEMPTS}) reached after "
            f"{elapsed:.1f} seconds without completion"
        )
    
    def _decode_template_values(self, result: Dict[str, Any]):
        try:
            data = result.get("data", {})
            output = data.get("output", [])
            
            if not output:
                return
            
            print("\n" + "="*80)
            print("DECODED TEMPLATE VALUES")
            print("="*80)
            
            for template in output:
                template_id = template.get("template_id", "unknown")
                template_value = template.get("value", "")
                
                if template_value:
                    try:
                        decoded_bytes = base64.b64decode(template_value)
                        decoded_str = decoded_bytes.decode('utf-8')
                        decoded_json = json.loads(decoded_str)
                        
                        print(f"\nTemplate: {template_id}")
                        print("-" * 80)
                        print(json.dumps(decoded_json, indent=2))
                        
                    except (base64.binascii.Error, json.JSONDecodeError, UnicodeDecodeError) as e:
                        print(f"\nTemplate: {template_id}")
                        print(f"  (Could not decode: {type(e).__name__})")
        
        except Exception as e:
            print(f"\nNote: Could not decode template values: {str(e)}")
    
    def run_flow(self, file_path: str, additional_data: Optional[Dict] = None) -> Dict[str, Any]:
        print(f"\n{'#'*80}")
        print("# Voice2Rx Non-VADED Flow Automation")
        print(f"{'#'*80}")
        print(f"Client ID: {self.client_id}")
        print(f"Audio File: {file_path}")
        print(f"{'#'*80}")
        
        try:
            self.login()
            
            presigned_data = self.get_presigned_url()
            
            upload_result = self.upload_file_to_s3(
                presigned_data['uploadData'],
                presigned_data['folderPath'],
                file_path
            )
            
            s3_url = presigned_data['uploadData']['url']
            s3_key = upload_result['key']
            
            bucket_name = s3_url.split('//')[1].split('.s3')[0]
            
            batch_s3_url = f"s3://{bucket_name}/{presigned_data['folderPath']}"
            
            print(f"\nBatch S3 URL: {batch_s3_url}")
            
            self.init_transaction(batch_s3_url, additional_data)
            
            final_result = self.poll_result()
            
            print(f"\n{'#'*80}")
            print("# Non-VADED Flow Completed Successfully!")
            print(f"{'#'*80}")
            
            return final_result
            
        except Exception as e:
            print(f"\n{'#'*80}")
            print("# Non-VADED Flow Failed!")
            print(f"{'#'*80}")
            print(f"Error: {str(e)}")
            raise


def main():
    parser = argparse.ArgumentParser(
        description='Voice2Rx Non-VADED Flow Automation Script',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
            Examples:
            # Basic usage with client credentials
            python non_vaded_flow.py --client-id YOUR_ID --client-secret YOUR_SECRET
            
            # With custom audio file path
            python non_vaded_flow.py --client-id YOUR_ID --client-secret YOUR_SECRET \\
                --file-path /path/to/audio.mp3
            
            # With additional authentication parameters
            python non_vaded_flow.py --client-id YOUR_ID --client-secret YOUR_SECRET \\
                --api-key YOUR_KEY --user-token YOUR_TOKEN
            
            # With custom template and additional data
            python non_vaded_flow.py --client-id YOUR_ID --client-secret YOUR_SECRET \\
                --template-id custom_template --speciality cardiology
        """
    )
    
    parser.add_argument(
        '--client-id',
        required=True,
        help='Client ID for authentication'
    )
    
    parser.add_argument(
        '--client-secret',
        required=True,
        help='Client secret for authentication'
    )

    parser.add_argument(
        '--file-path',
        default=Config.DEFAULT_AUDIO_FILE,
        help=f'Path to audio file (default: {Config.DEFAULT_AUDIO_FILE})'
    )
    
    parser.add_argument(
        '--mode',
        default=Config.DEFAULT_MODE,
        help=f'Transaction mode (default: {Config.DEFAULT_MODE})'
    )
    
    parser.add_argument(
        '--input-language',
        nargs='+',
        default=Config.DEFAULT_INPUT_LANGUAGE,
        help=f'Input language(s) (default: {" ".join(Config.DEFAULT_INPUT_LANGUAGE)})'
    )
    
    parser.add_argument(
        '--output-language',
        default=Config.DEFAULT_OUTPUT_LANGUAGE,
        help=f'Output language (default: {Config.DEFAULT_OUTPUT_LANGUAGE})'
    )
    
    parser.add_argument(
        '--speciality',
        default=Config.DEFAULT_SPECIALITY,
        help=f'Medical speciality (default: {Config.DEFAULT_SPECIALITY})'
    )
    
    parser.add_argument(
        '--template-id',
        default=Config.DEFAULT_TEMPLATE_ID,
        help=f'Output template ID (default: {Config.DEFAULT_TEMPLATE_ID})'
    )
    
    parser.add_argument(
        '--codification',
        action='store_true',
        help='Enable codification for output template'
    )
    
    parser.add_argument(
        '--poll-interval',
        type=int,
        default=Config.POLL_INTERVAL,
        help=f'Polling interval in seconds (default: {Config.POLL_INTERVAL})'
    )
    
    parser.add_argument(
        '--max-poll-attempts',
        type=int,
        default=Config.MAX_POLL_ATTEMPTS,
        help=f'Maximum polling attempts (default: {Config.MAX_POLL_ATTEMPTS})'
    )
    
    parser.add_argument(
        '--additional-data',
        type=str,
        help='Additional data as JSON string (e.g., \'{"doctor": {...}, "patient": {...}}\')'
    )
    
    args = parser.parse_args()
    
    if not os.path.exists(args.file_path):
        print(f"Error: Audio file not found: {args.file_path}")
        print("\nPlease provide a valid audio file path using --file-path")
        sys.exit(1)
    
    Config.POLL_INTERVAL = args.poll_interval
    Config.MAX_POLL_ATTEMPTS = args.max_poll_attempts
    
    additional_data = None
    if args.additional_data:
        try:
            additional_data = json.loads(args.additional_data)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in --additional-data: {e}")
            sys.exit(1)
    
    client = Voice2RxNonVadedClient(
        client_id=args.client_id,
        client_secret=args.client_secret,
        api_key=args.api_key,
        user_token=args.user_token
    )
    
    if args.mode != Config.DEFAULT_MODE:
        Config.DEFAULT_MODE = args.mode
    if args.speciality != Config.DEFAULT_SPECIALITY:
        Config.DEFAULT_SPECIALITY = args.speciality
    if args.template_id != Config.DEFAULT_TEMPLATE_ID:
        Config.DEFAULT_TEMPLATE_ID = args.template_id
    
    try:
        client.run_flow(
            file_path=args.file_path,
            additional_data=additional_data
        )
        sys.exit(0)
    except Exception as e:
        print(f"\nAutomation failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

