"""
Voice2Rx VADED Flow Automation Script

This script automates the complete VADED flow testing:
1. Init API call
2. Upload audio files to S3
3. Stop API call
4. Commit API call
5. Poll result/status API until completion

Usage:
    python vaded_flow.py --env dev
    python vaded_flow.py --env stage --result-mode template --template-id <template_id>
    python vaded_flow.py --env prod --result-mode transcript
"""

import requests
import json
import time
import uuid
import os
import sys
import argparse
import boto3
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

class Config:
    current_env = os.getenv("ENV", "dev")
    ENVIRONMENTS = {
        'dev': 'http://localhost:8080',
        'stage': 'http://v2rxbe.orbi.dev',
        'prod': 'http://v2rxbe.orbi.orbi'
    }
    
    if current_env == 'prod':
        JWT_PAYLOD = {"aud":"doc-web","b-id":"7174768551242883","cc":{"esc":1,"pst":"false","sty":"p"},"dob":"2001-05-12","exp":1766922364,"fn":"Vicky","gen":"M","iat":1766920564,"idp":"google","iss":"emr.eka.care","jti":"e6ad22d3-3aaa-4425-8ccd-c4374a7ad933","ln":"Tiwari","oid":"174768551272081","pri":True,"ps":"D","r":"US","s":"Dr","uuid":"40ece9e3-b14e-4375-9950-200217e71d50","w-id":"7174768551242883","w-n":"Vicky-Tiwari"} #prod jwt payload
    else:
        JWT_PAYLOAD = {"aud":"doc-web","b-id":"7175317283762441","cc":{"esc":1,"sty":"p"},"dob":"2001-05-12","exp":1766863093,"fn":"Vicky","gen":"M","iat":1766861293,"idp":"google","iss":"emr.eka.care","jti":"4f8716df-9c6b-467b-87eb-d70715c33214","ln":"Tiwari","mn":"Kumar","oid":"175317283790140","pri":True,"ps":"AD","r":"IN","s":"Dr","uuid":"cd321f47-3924-41fa-8995-4a869b38435e","w-id":"7175317283762441","w-n":"vicky-google-account"} #stage jwt payload
    
    AUDIO_FILES = ["1.mp3", "2.mp3"]
    # /Users/vickykumar/Downloads/vaded
    AUDIO_FILES_SOURCE_DIR = os.path.expanduser("/Users/vickykumar/Downloads/vaded")
    
    POLL_INTERVAL = 3 
    MAX_POLL_ATTEMPTS = 100
    
    # result api modes: 'default', 'template', 'transcript'
    # result api can be called with provided template id or only for transcript or for all the templates(without any query params).
    RESULT_MODE = 'default'

    # template id need to be provided if result need to be polled for a specific tempalte
    # (get the one of the template id from the init api request payload).
    TEMPLATE_ID = None 
    
    @classmethod
    def get_base_url(cls, env: str) -> str:
        return cls.ENVIRONMENTS.get(env, cls.ENVIRONMENTS['dev'])
    
    @classmethod
    def get_jwt_payload_string(cls) -> str:
        return json.dumps(cls.JWT_PAYLOAD)
    
    @classmethod
    def get_bid(cls) -> str:
        return cls.JWT_PAYLOAD.get('b-id', 'EC_173373528300322')

    @classmethod
    def get_v2rx_s3_bucket_name(cls) -> str:
        if cls.current_env == 'dev' or cls.current_env == 'stage':
            return 'm-pp-voice2rx'
        elif cls.current_env == 'prod':
            return 'm-prod-voice-record'
        else:
            raise ValueError(f"Invalid environment: {cls.current_env}")

class Voice2RxAPIClient:

    def __init__(self, base_url: str, transaction_id: str):
        self.base_url = base_url
        self.transaction_id = transaction_id
        self.jwt_payload = Config.get_jwt_payload_string()
        self.bid = Config.get_bid()
        
    def _get_common_headers(self) -> Dict[str, str]:
        """Get common headers for API calls"""
        return {
            'jwt-payload': self.jwt_payload,
            'Content-Type': 'application/json',
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'client-id': 'doc-web',
            'flavour': 'web',
            'pragma': 'no-cache',
        }
    
    def init_transaction(self, payload: Dict[str, Any]) -> tuple[Dict[str, Any], float]:
        
        url = f"{self.base_url}/voice/api/v2/transaction/init/{self.transaction_id}"
        headers = self._get_common_headers()
        
        print(f"\n{'='*80}")
        print("STEP 1: Initializing Transaction")
        print(f"{'='*80}")
        print(f"URL: {url}")
        print(f"Transaction ID: {self.transaction_id}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        start_time = time.time()
        response = requests.post(url, headers=headers, json=payload)
        elapsed_time = time.time() - start_time
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        print(f"Init completed in {elapsed_time:.2f} seconds")
        
        if response.status_code not in [200, 201]:
            raise Exception(f"Init API failed with status {response.status_code}: {response.text}")
        
        return response.json(), elapsed_time
    
    def stop_transaction(self, audio_files: List[str]) -> tuple[Dict[str, Any], float]:

        url = f"{self.base_url}/voice/api/v2/transaction/stop/{self.transaction_id}"
        headers = self._get_common_headers()
        payload = {"audio_files": audio_files}
        
        print(f"\n{'='*80}")
        print("STEP 3: Stopping Transaction")
        print(f"{'='*80}")
        print(f"URL: {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        start_time = time.time()
        response = requests.post(url, headers=headers, json=payload)
        elapsed_time = time.time() - start_time
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        print(f"Stop completed in {elapsed_time:.2f} seconds")
        
        if response.status_code not in [200, 201]:
            raise Exception(f"Stop API failed with status {response.status_code}: {response.text}")
        
        return response.json(), elapsed_time
    
    def commit_transaction(self, audio_files: List[str]) -> tuple[Dict[str, Any], float]:
        
        url = f"{self.base_url}/voice/api/v2/transaction/commit/{self.transaction_id}"
        headers = self._get_common_headers()
        payload = {"audio_files": audio_files}
        
        print(f"\n{'='*80}")
        print("STEP 4: Committing Transaction")
        print(f"{'='*80}")
        print(f"URL: {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        start_time = time.time()
        response = requests.post(url, headers=headers, json=payload)
        elapsed_time = time.time() - start_time
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        print(f"Commit completed in {elapsed_time:.2f} seconds")
        
        if response.status_code not in [200, 201]:
            raise Exception(f"Commit API failed with status {response.status_code}: {response.text}")
        
        return response.json(), elapsed_time
    
    def get_status(self, result_mode: str = 'default', template_id: Optional[str] = None) -> requests.Response:

        url = f"{self.base_url}/voice/api/v3/status/{self.transaction_id}"
        
        # Add query parameters based on mode
        params = {}
        if result_mode == 'template' and template_id:
            params['template_id'] = template_id
        elif result_mode == 'transcript':
            params['transcript'] = 'true'
        
        headers = {
            'jwt-payload': self.jwt_payload,
            'accept': '*/*'
        }
        
        response = requests.get(url, headers=headers, params=params)
        return response
    
    def poll_result(self, result_mode: str = 'default', template_id: Optional[str] = None) -> tuple[Dict[str, Any], float]:

        print(f"\n{'='*80}")
        print("STEP 5: Polling Result API")
        print(f"{'='*80}")
        print(f"Result Mode: {result_mode}")
        if template_id:
            print(f"Template ID: {template_id}")
        
        start_time = time.time()
        attempt = 0
        while attempt < Config.MAX_POLL_ATTEMPTS:
            attempt += 1
            
            print(f"\n{'='*40}")
            print(f"Attempt {attempt}/{Config.MAX_POLL_ATTEMPTS}")
            print(f"{'='*40}")
            
            response = self.get_status(result_mode, template_id)
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                elapsed_time = time.time() - start_time
                print("\nTransaction completed successfully!")
                print(f"Polling completed in {elapsed_time:.2f} seconds")
                print("\nFinal Result:")
                print("="*80)
                result = response.json()
                print(json.dumps(result, indent=2))
                return result, elapsed_time
            
            elif response.status_code == 202:
                print("Status: Still processing...")
                try:
                    result_202 = response.json()
                    print("\nCurrent Response (202):")
                    print(json.dumps(result_202, indent=2))
                except (ValueError, requests.exceptions.JSONDecodeError):
                    print("(No JSON response body)")
                
                print(f"\nWaiting {Config.POLL_INTERVAL} seconds before next poll...")
                time.sleep(Config.POLL_INTERVAL)
            
            else:
                print(f"\nUnexpected status code: {response.status_code}")
                print(f"Response: {response.text}")
                raise Exception(f"Unexpected status code: {response.status_code}")
        
        raise Exception(f"Max polling attempts ({Config.MAX_POLL_ATTEMPTS}) reached without completion")


class S3FileUploader:
    
    def __init__(self, s3_url: str, transaction_id: str, bid: str):
        self.s3_url = s3_url
        self.transaction_id = transaction_id
        self.bid = bid
        
        parsed = urlparse(s3_url)
        self.bucket = parsed.netloc
        self.prefix = parsed.path.lstrip('/')
        
        self.s3_client = boto3.client('s3')
    
    def upload_file(self, local_file_path: str, s3_file_name: str) -> bool:

        s3_key = f"{self.prefix}/{s3_file_name}" if self.prefix else s3_file_name
        metadata = {
            'bid': self.bid,
            'txnid': self.transaction_id
        }
        
        print(f"  - Uploading {local_file_path}")
        print(f"    to s3://{self.bucket}/{s3_key}")
        print(f"    with metadata: {metadata}")
        
        try:
            self.s3_client.upload_file(
                local_file_path,
                self.bucket,
                s3_key,
                ExtraArgs={
                    'Metadata': metadata,
                    'ContentType': 'audio/mpeg'
                }
            )
            print("Upload successful")
            return True
        
        except Exception as e:
            print(f"Upload failed: {str(e)}")
            raise
    
    def upload_files(self, audio_files: List[str], source_dir: str) -> bool:

        print(f"\n{'='*80}")
        print("STEP 2: Uploading Audio Files to S3")
        print(f"{'='*80}")
        print(f"Bucket: {self.bucket}")
        print(f"Prefix: {self.prefix}")
        print(f"Source Directory: {source_dir}")
        print(f"Files: {audio_files}")
        
        for file_name in audio_files:
            local_path = os.path.join(source_dir, file_name)
            
            if not os.path.exists(local_path):
                raise FileNotFoundError(f"Audio file not found: {local_path}")
            
            self.upload_file(local_path, file_name)
        
        print("\nAll files uploaded successfully")
        return True


class VadedFlowOrchestrator:
    
    def __init__(self, env: str, result_mode: str = 'default', template_id: Optional[str] = None):
        self.env = env
        self.base_url = Config.get_base_url(env)
        self.result_mode = result_mode
        self.template_id = template_id
        
        self.transaction_id = str(uuid.uuid4()) + "at-vk-tst"
        
        self.api_client = Voice2RxAPIClient(self.base_url, self.transaction_id)
        
        print(f"\n{'#'*80}")
        print("# Voice2Rx VADED Flow Automation")
        print(f"{'#'*80}")
        print(f"Environment: {env}")
        print(f"Base URL: {self.base_url}")
        print(f"Transaction ID: {self.transaction_id}")
        print(f"Result Mode: {result_mode}")
        if template_id:
            print(f"Template ID: {template_id}")
        print(f"{'#'*80}")
    
    def get_init_payload(self) -> Dict[str, Any]:
        bucket_name = Config.get_v2rx_s3_bucket_name()
        static_template_id = "f2c26479-f9b8-4462-a909-82c6829e1416"

        import datetime as dt
        date = dt.datetime.now().strftime("%Y%m%d")
        
        year = date[2:4]
        month = date[4:6]
        day = date[6:]
        date_str = f"{year}{month}{day}"

        return {
            "mode": "consultation",
            "fhir_ingested": True,
            "s3_url": f"s3://{bucket_name}/{date_str}/{self.transaction_id}",
            "additional_data": {
                "hfid": 20,
                "vicky-test-info": "20"
            },
            "input_language": ["en-IN"],
            "output_format_template": [
                {
                    "template_id": static_template_id,
                    "template_type": "custom",
                    "template_name": "General Health Check-Up Template"
                },
                {
                    "template_id": "eka_emr_template",
                    "template_type": "default",
                    "template_name": "Eka Emr Tempalte"
                }
            ],
            "model_training_consent": False,
            "auto_download": False,
            "transfer": "vaded",
            "system_info": {
                "platform": "MacIntel",
                "language": "en-US",
                "timeZone": "Asia/Calcutta",
                "hardwareConcurrency": 8,
                "deviceMemory": 8,
                "networkInfo": {
                    "effectiveType": "3g",
                    "latency": 0,
                    "downloadSpeed": 0.45,
                    "connectionType": "Not available"
                }
            },
            "patient_details": {
                "username": "vicky-test-user",
                "age": 16,
                "biologicalSex": "M"
            },
            "model_type": "pro",
            "version": "1.4.43"
        }
    
    def run(self) -> Dict[str, Any]:
        try:
            overall_start_time = time.time()
            
            # Step 1: Init
            init_payload = self.get_init_payload()
            _, init_time = self.api_client.init_transaction(init_payload)
            
            # Step 2: Upload to S3
            s3_url = init_payload['s3_url']
            uploader = S3FileUploader(
                s3_url=s3_url,
                transaction_id=self.transaction_id,
                bid=Config.get_bid()
            )
            upload_start = time.time()
            uploader.upload_files(Config.AUDIO_FILES, Config.AUDIO_FILES_SOURCE_DIR)
            upload_time = time.time() - upload_start
            
            # Step 3: Stop
            _, stop_time = self.api_client.stop_transaction(Config.AUDIO_FILES)
            
            # Step 4: Commit
            _, commit_time = self.api_client.commit_transaction(Config.AUDIO_FILES)
            
            # Step 5: Poll for result
            final_result, poll_time = self.api_client.poll_result(self.result_mode, self.template_id)
            
            total_time = time.time() - overall_start_time
            
            # Print timing summary
            print(f"\n{'#'*80}")
            print("# VADED Flow Completed Successfully!")
            print(f"{'#'*80}")
            print("\nTIMING SUMMARY:")
            print(f"{'='*80}")
            print(f"  Init API:          {init_time:>8.2f} seconds")
            print(f"  S3 Upload:         {upload_time:>8.2f} seconds")
            print(f"  Stop API:          {stop_time:>8.2f} seconds")
            print(f"  Commit API:        {commit_time:>8.2f} seconds")
            print(f"  Result Polling:    {poll_time:>8.2f} seconds")
            print(f"  {'='*40}")
            print(f"  TOTAL TIME:        {total_time:>8.2f} seconds ({total_time/60:.2f} minutes)")
            print(f"{'='*80}\n")
            
            return final_result
        
        except Exception as e:
            print(f"\n{'#'*80}")
            print("# VADED Flow Failed!")
            print(f"{'#'*80}")
            print(f"Error: {str(e)}")
            raise


def main():
    parser = argparse.ArgumentParser(
        description='Voice2Rx VADED Flow Automation Script',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
            Examples:
            # Run on dev environment with default result mode
            python vaded_flow.py --env dev
            
            # Run on stage with template-specific result
            python vaded_flow.py --env stage --result-mode template --template-id f2c26479-f9b8-4462-a909-82c6829e1416
            
            # Run on prod with transcript mode
            python vaded_flow.py --env prod --result-mode transcript
            
            # Custom audio files directory
            python vaded_flow.py --env dev --audio-dir /path/to/audio/files
        """
    )
    
    parser.add_argument(
        '--env',
        choices=['dev', 'stage', 'prod'],
        default='dev',
        help='Environment to run against (default: dev)'
    )
    
    parser.add_argument(
        '--result-mode',
        choices=['default', 'template', 'transcript'],
        default='default',
        help='Result API mode (default: default)'
    )
    
    parser.add_argument(
        '--template-id',
        type=str,
        help='Template ID for template mode'
    )
    
    parser.add_argument(
        '--audio-dir',
        type=str,
        default=Config.AUDIO_FILES_SOURCE_DIR,
        help=f'Directory containing audio files (default: {Config.AUDIO_FILES_SOURCE_DIR})'
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
    
    args = parser.parse_args()
    
    if args.result_mode == 'template' and not args.template_id:
        parser.error("--template-id is required when --result-mode is 'template'")
    
    Config.AUDIO_FILES_SOURCE_DIR = args.audio_dir
    Config.POLL_INTERVAL = args.poll_interval
    Config.MAX_POLL_ATTEMPTS = args.max_poll_attempts
    
    for file_name in Config.AUDIO_FILES:
        file_path = os.path.join(Config.AUDIO_FILES_SOURCE_DIR, file_name)
        if not os.path.exists(file_path):
            print(f"Error: Audio file not found: {file_path}")
            print(f"\nPlease ensure the following files exist in {Config.AUDIO_FILES_SOURCE_DIR}:")
            for f in Config.AUDIO_FILES:
                print(f"  - {f}")
            sys.exit(1)
    
    orchestrator = VadedFlowOrchestrator(
        env=args.env,
        result_mode=args.result_mode,
        template_id=args.template_id
    )
    
    try:
        orchestrator.run()
        sys.exit(0)
    except Exception as e:
        print(f"\nAutomation failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()

