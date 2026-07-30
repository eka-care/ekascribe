# you have to write as a script for below task do step by step
# 1. call the init api with required parameters
# 2. Load the 3.m4a, 4.m4a ..vaded files from scripts/files/vaded_audio 
# 3. push to s3 vaded bucket stage - bucket
# 4. call the stop api with required parameters
# 5. call the commit api with required parameters
    #  - check whether the action is structuring in sqs_name = "voice2rx"
    # - Result api (DS hold)
    
import sys
import os
import uuid
import json
import boto3
import requests
import time
from pathlib import Path
from voice2rx.api.endpoints.transactions.init_api import initialize_transaction
from voice2rx.api.endpoints.transactions.commit import commit_transaction_details
from voice2rx.api.endpoints.transactions.stop import stop_transaction_details
from voice2rx.utils.s3_utils import build_s3_folder_path, list_files_in_s3_folder
from voice2rx.choices import VOICE2RX_STATUS, VOICE2RX_USER_STATUS
import asyncio
from voice2rx.api.schemas.transaction import (
    VadStatus
    )

TXN_ID = "1234"
B_ID = "b-6789"
VADED_AUDIO_DIR = "scripts/files/vaded_audio"  
API_BASE_URL = "http://v2rxbe.orbi.orbi"
S3_VADED_BUCKET_NAME = "m-pp-voice2rx"    # for Prod: "m-prod-voice-record"
HEADER = {
        "Content-Type": "application/json",
        "jwt-payload": json.dumps({"c-id":"","b-id": B_ID,"uuid": ""})
    }

s3_client = boto3.client('s3', region_name='ap-south-1')

def call_init_api():
    print(f"👉 Initializing transaction with ID: {TXN_ID}")
    
    init_data = {
        "mode": "dictation",
        "transfer": "vaded",
        "s3_url": "s3://m-pp-voice2rx/" + build_s3_folder_path(TXN_ID),
    }

    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/init/{TXN_ID}",
        headers=HEADER,
        json=init_data
    )
    
    status = "Transaction initialized Response = "
    if response.status_code not in [200, 201]:
        raise Exception(f"Error initializing transaction: {response.status_code} - {response.text}")
    
    if response.status_code:
        status = status + "status :" +str(response.status_code) + " - "
    if response.text:
        status = status + "data :" + str(response.text)
    print(status+"\n")

def upload_files_to_s3():
    print("👉 Uploading vaded audio files to S3...")
    
    # Get all .m4a files from the directory
    vaded_dir = Path(VADED_AUDIO_DIR)
    audio_files = list(vaded_dir.glob("*.m4a"))
    s3_folder_path = build_s3_folder_path(TXN_ID)
    
    if not audio_files:
        print("No audio files found in the directory!")
        exit(1)
    
    uploaded_files = []
    
    for audio_file in audio_files:
        file_name = audio_file.name
        s3_key = f"{s3_folder_path}{file_name}"  # Use s3_folder_path here
        
        print(f"Uploading {file_name} to S3 at {s3_key}...")
        
        try:
            # Upload file with metadata
            s3_client.upload_file(
                str(audio_file),
                S3_VADED_BUCKET_NAME,
                s3_key,
                ExtraArgs={
                    "Metadata": {
                        "txnid": TXN_ID,
                        "bid": B_ID
                    }
                }
            )
            
            uploaded_files.append(file_name)
        
        except Exception as e:
            print(f"Failed to upload {file_name} to S3. Error: {str(e)}")
            raise Exception("Failed to upload files")
    
    if not uploaded_files:
        print("No files were successfully uploaded to S3. Exiting...")
        raise Exception("Failed to upload files")
    else:
        print(f"Successfully uploaded {uploaded_files}")

    return uploaded_files

def call_stop_api(audio_files):
    """Call the stop API with the list of audio files"""
    print("\n👉 Calling stop API...")
    
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/stop/{TXN_ID}",
        headers=HEADER,
        json= {
        "audio_files": audio_files
        }
    )
    
    if response.status_code == 409:
        print(f"Error stopping transaction = status:{response.status_code} - data:{response.text}")
    elif response.status_code != 200:
        print(f"Error stopping transaction = status:{response.status_code} - data:{response.text}")
        raise Exception("Failed to stop transaction")
    else:
        print(f"Transaction stopped successfully = status:{response.status_code} - data:{response.text}\n")

def call_commit_api(audio_files):
    print("👉 Calling commit API...")
    
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/commit/{TXN_ID}",
        headers=HEADER,
        json= {
        "audio_files": audio_files
        }
    )
    if response.status_code == 409:
        print(f"Error committing transaction = status:{response.status_code} - data:{response.text}")
    elif response.status_code != 200:
        print(f"Error committing transaction = status:{response.status_code} - data:{response.text}")
        raise Exception("Failed to commit transaction")
    else:
        print(f"Transaction committed successfully = status:{response.status_code} - data:{response.text}")    
    
def test_after_init_api():
    """
    Check status from DynamoDB { vad_status: START/FINISH, status: INIT, user_status: INIT }
    """
    response = requests.get(
        f"{API_BASE_URL}/voice/api/v2/transaction/{TXN_ID}",
        headers=HEADER,
    )
    assert response.status_code == 200, f"Error fetching transaction status: {response.status_code} - {response.text}"
    
    data = response.json().get("data", {})
    
    assert data.get("status") == VOICE2RX_STATUS.INIT.value, f"Unexpected status: {data.get('status')}"
    assert data.get("user_status") == VOICE2RX_USER_STATUS.INIT.value, f"Unexpected user_status: {data.get('user_status')}"
    assert data.get("vad_status") in (VadStatus.START.value, VadStatus.FINISH.value), f"Unexpected vad_status: {data.get('vad_status')}"
    
    print("✅ Transaction initialized data has been updated in DynamoDB.")

def test_s3_uploaded_files(uploaded_files):
    """
    Test if the uploaded files are correctly stored in S3.
    - Check if the files exist in the S3 folder.
    - Ensure the uploaded files match the files in S3.
    """
    folder_path = build_s3_folder_path(TXN_ID)
    s3_files = list_files_in_s3_folder(s3_client, S3_VADED_BUCKET_NAME, folder_path, extension=".m4a")
    
    if not s3_files:
        raise Exception("No files found in S3. Upload might have failed.")
    
    # Extract the file names from the S3 keys
    s3_file_names = [Path(file).name for file in s3_files]
    
    # Assert that all uploaded files are present in S3
    assert set(uploaded_files) == set(s3_file_names), (
        f"Mismatch between uploaded files and S3 files. "
        f"Uploaded: {uploaded_files}, S3: {s3_file_names}"
    )
    print("✅ All uploaded files are correctly stored in S3.")

def test_after_stop_api(uploaded_files):
    response = requests.get(
        f"{API_BASE_URL}/voice/api/v2/transaction/{TXN_ID}",
        headers=HEADER,
    )
    assert response.status_code == 200, f"Error fetching transaction status: {response.status_code} - {response.text}"
    data = response.json().get("data", {})
    
    assert data.get("user_status") == VOICE2RX_STATUS.STOPPED.value, f"Unexpected user_status: {data.get('user_status')}"
    assert set(data.get("client_generated_files")) == set(uploaded_files), f"Unexpected vad_status: {data.get('vad_status')}"
    print("✅ Transaction stopeed data has been updated in DynamoDB.")

def test_after_commit_api(uploaded_files):
    response = requests.get(
        f"{API_BASE_URL}/voice/api/v2/transaction/{TXN_ID}",
        headers=HEADER,
    )
    assert response.status_code == 200, f"Error fetching transaction status: {response.status_code} - {response.text}"
    data = response.json().get("data", {})
    
    assert data.get("user_status") == VOICE2RX_USER_STATUS.COMMIT.value, f"Unexpected user_status: {data.get('user_status')}"
    assert set(data.get("client_generated_files")) == set(uploaded_files), f"Unexpected client_generated_files: {data.get('client_generated_files')}"
    print("✅ Transaction commit data has been updated in DynamoDB.")

def delete_transaction_item():
    print("\n👉 Deleting transaction from DynamoDB...")
    try:       
        response = requests.delete(
            f"{API_BASE_URL}/voice/api/v2/transaction/{TXN_ID}",
            headers=HEADER,
        )
        if response.status_code == 200:
            print(f"✅ Transaction {TXN_ID} deleted successfully from DynamoDB.")
        elif response.status_code == 403:
            print(f"❌ Transaction {TXN_ID} not have permission to delete.")
        else:
            print(f"❌ Error deleting transaction from DynamoDB. Status: {response.status_code} - {response.text}")
            raise Exception("Failed to delete transaction from DynamoDB")
        
    except Exception as e:
        print(f"❌ Error deleting transaction from DynamoDB: {str(e)}")
        raise Exception("Failed to delete transaction from DynamoDB")

def test_init_api_negative_cases():
    print("\n=== Testing Init API Negative Cases ===")
    
    # Test Case 1: Missing mode
    init_data = {
        "transfer": "vaded",
        "s3_url": ""
    }
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/init/{TXN_ID}",
        headers=HEADER,
        json=init_data
    )
    # TODO 4: status_code for missing and invalid data is 400
    assert response.status_code == 422, f"API should return 422 for missing required field {response.text}"
    print("\nTest Case 1: Missing 'mode' field passed 🔍")
    
    
    # Test Case 2: Missing transfer
    init_data = {
        "mode": "dictation",
        "s3_url": ""
    }
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/init/{TXN_ID}",
        headers=HEADER,
        json=init_data
    )
    assert response.status_code == 422, f"API should return 422 for missing required field {response.text}"
    print("\nTest Case 2: Missing 'transfer' field passed 🔍")
    
    
    # Test Case 3: Invalid mode value
    init_data = {
        "mode": "invalid_mode",
        "transfer": "vaded",
        "s3_url": ""
    }
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/init/{TXN_ID}",
        headers=HEADER,
        json=init_data
    )
    assert response.status_code == 422,  f"API should return 422 for Invalid required field {response.text}"
    print("\nTest Case 3: Invalid 'mode' value passed 🔍\n")
    
    print("✅ All init API negative tests passed\n\n")

def test_stop_api_negative_cases():
    print("\n=== Testing Stop API Negative Cases ===")
    
    # Test Case 1: Missing audio_files
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/stop/{TXN_ID}",
        headers=HEADER,
        json={}
    )
    assert response.status_code == 400, f"API should return 400 for missing audio_files {response.text}"
    print("\nTest Case 1: Missing 'audio_files' field passed 🔍")
    
    # Test Case 2: Empty audio_files list
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/stop/{TXN_ID}",
        headers=HEADER,
        json={"audio_files": []}
    )
    assert response.status_code == 400, f"API should return 400 for empty audio_files list {response.text}"
    print("\nTest Case 2: Empty 'audio_files' list passed 🔍")
    
    # Test Case 3: Non-existent transaction ID
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/stop/on_test_12345",
        headers=HEADER,
        json={"audio_files": ["file1.m4a"]}
    )
    assert response.status_code == 400, f"API should return 400 for non-existent transaction {response.text}"
    print("\nTest Case 3: Non-existent transaction ID passed 🔍")
    
    print("✅ All stop API negative tests passed\n")

def test_commit_api_negative_cases():
    print("\n=== Testing Commit API Negative Cases ===")
    
    # Test Case 1: Missing audio_files
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/commit/{TXN_ID}",
        headers=HEADER,
        json={}
    )
    assert response.status_code == 400, f"API should return 400 for missing audio_files {response.text}"
    print("\nTest Case 1: Missing 'audio_files' field passed 🔍")
    
    # Test Case 2: Empty audio_files list
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/commit/{TXN_ID}",
        headers=HEADER,
        json={"audio_files": []}
    )
    assert response.status_code == 400, f"API should return 400 for empty audio_files list {response.text}"
    print("\nTest Case 2: Empty 'audio_files' list passed 🔍")
    
    # Test Case 3: Non-existent transaction ID
    response = requests.post(
        f"{API_BASE_URL}/voice/api/v2/transaction/commit/no_test_12345",
        headers=HEADER,
        json={"audio_files": ["file1.m4a"]}
    )
    assert response.status_code == 400, f"API should return 400 for non-existent transaction {response.text}"
    print("\nTest Case 3: Non-existent transaction ID passed 🔍")
    
    print("✅ All commit API negative tests passed\n")
            
if __name__ == "__main__":
    """Main function to run the complete workflow"""
    print("\n=== Starting Voice2Rx Vaded to Structured Pipeline ===\n")
    
    try:
        # Step 1: Call init API
        run_full_test = len(sys.argv) > 1 and sys.argv[1].lower() == 'fulltest'
        
        call_init_api()
        test_after_init_api()
        if run_full_test:
            test_init_api_negative_cases()
        
        
        # Step 2 & 3: Load and upload vaded audio files to S3
        uploaded_files = upload_files_to_s3()
        test_s3_uploaded_files(uploaded_files)
        
        # Step 4: Call stop API        
        call_stop_api(uploaded_files)
        test_after_stop_api(uploaded_files)
        if run_full_test:
            test_stop_api_negative_cases()
        
        # Step 5: Call commit API
        call_commit_api(uploaded_files)
        test_after_commit_api(uploaded_files)
        if run_full_test:
            test_commit_api_negative_cases()

        #TODO 1- Test for action={structuring / Transcription} in SQS Will be implemented though mock function on lambda
        #TODO 2- Result api calling and test
        #TODO 3- Webhook calling and test
        
        
        # delete the transaction from dyanmodb (txn_id)
        print("----- Cleaning Up ------")
        delete_transaction_item()
        
        print("\n=== Pipeline Execution Summary ===")
        print(f"Transaction ID: {TXN_ID}")
        print(f"Files processed: {len(uploaded_files)}")
        print(f"Test mode: {'Full Test (including negative cases)' if run_full_test else 'Standard Flow'}")
        print("\n=== Pipeline Complete ===\n")
    
    except Exception as e:
        print("\n\n=== Pipeline Execution Failed ===")
        delete_transaction_item()
        print(f"\n❌ Pipeline failed: {str(e)}")