

# do pip install ekacare before running this script.
from ekacare import EkaCareClient
# --- Configuration Needed MUST ---
CLIENT_ID = "<your_client_id>"
CLIENT_SECRET = "<your_client_secret>"
AUDIO_FILE_LIST = ["<YOUR_AUDIO_FILE_PATH>"] 
TRANSACTION_ID = "<YOUR_TRANSACTION_ID>"
TEMPLATE_ID = "transcript_template"

ACTION_TYPE = "ekascribe-v2"
EXTRA_PARAMS = {
        "mode": "dictation",
        "patient": {
            "name": "John Doe",},
        "output_language" : "hi",
        }

def main():
    try:
        client = EkaCareClient(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)
        AUTHENTICATE_CLIENT(client)
        audio_paths_list = AUDIO_FILE_LIST
        action_type = ACTION_TYPE  
        extra_params = EXTRA_PARAMS
        UPLOAD_AUDIO_FILES(client, audio_paths_list, TRANSACTION_ID, action_type, extra_params)
        GET_TRANSCRIPTION_RESULTS(client, TRANSACTION_ID)
        
    except Exception as e:
        print(f"Error: {str(e)}")

def AUTHENTICATE_CLIENT(client):
    print("=== Authentication Example ===")
    token_response = client.auth.login()
    print(f"Initial Access Token: {token_response['access_token']}")
    print(f"Initial Refresh Token: {token_response['refresh_token']}")

    client.set_access_token(token_response["access_token"])

    refreshed_tokens = client.auth.refresh_token(token_response["refresh_token"])
    print(f"New Access Token: {refreshed_tokens['access_token']}")
    
    client.set_access_token(refreshed_tokens["access_token"])

def UPLOAD_AUDIO_FILES(client, audio_file_paths, transaction_id, action, extra_data):
    print("\n=== File Upload Example ===")
    
    try:
        responses = client.v2rx.upload(
            file_paths=audio_file_paths, 
            txn_id=transaction_id, 
            action=action, 
            extra_data=extra_data,
            output_format = {
                "input_language": ["en-IN"],
                "output_template": [
                    {
                        "template_id": TEMPLATE_ID
                    }
                ]
            }
        )
        
        print("File upload API call successful. Responses:")
        if responses: # Check if responses is not None and not empty
            for i, response_item in enumerate(responses):
                print(f"  Response for file {i+1}:")
                print(f"    Key: {response_item.get('key', 'N/A')}") 
                print(f"    Content Type: {response_item.get('contentType', response_item.get('content_type', 'N/A'))}")
                print(f"    Size: {response_item.get('size', 'N/A')} bytes")
        else:
            print("     No detailed response items received from file upload, or upload failed silently at SDK level.")
            
        return responses
    except Exception as e:
        print(f"    Error during file upload: {str(e)}")
        return None

def GET_TRANSCRIPTION_RESULTS(client, session_id):
    print("=== V2RX Fetcher Example ===")
    import time
    import base64
    import json
    from datetime import datetime
    
    max_duration = 60  # Maximum polling duration in seconds (1 minute)
    poll_interval = 5  # Poll every 5 seconds
    start_time = time.time()
    
    while True:
        try:
            elapsed_time = time.time() - start_time
            if elapsed_time >= max_duration:
                print(f"  Timeout reached after {max_duration} seconds. Stopping polling.")
                return None
            print(f"  Polling session status... (elapsed: {elapsed_time:.1f}s)")
            session_status = client.v2rx.get_session_status(session_id, ACTION_TYPE)
        
            if session_status:
                data = session_status.get("data", {})
                if data:
                    output = data.get("output", {})
                    if output:
                        print(f"Session Status: {session_status}")
                        print("  Successfully retrieved session status!")
                       
                        for template in output:
                            if template.get("template_id") == TEMPLATE_ID:
                                print(f"\n  Found template with ID: {TEMPLATE_ID}")
                                template_value = template.get("value", "")
                                
                                if template_value:
                                    try:
                                        decoded_data = base64.b64decode(template_value)
                                        decoded_json = json.loads(decoded_data.decode('utf-8'))
                                        
                                        print("\n\nDecoded JSON:")
                                        print(json.dumps(decoded_json, indent=2))
                                        print("\n\n")
                                    except base64.binascii.Error as _:
                                        pass
                                    except json.JSONDecodeError as _:
                                       pass
                                    except Exception as _:
                                      pass
                        return session_status
            
            # Wait before next poll
            print(f"  Waiting {poll_interval} seconds before next poll...")
            time.sleep(poll_interval)
            
        except Exception as e:
            print(f"  Error fetching V2RX status for session_id {session_id}: {str(e)}")
            elapsed_time = time.time() - start_time
            if elapsed_time >= max_duration:
                print(f"  Timeout reached after {max_duration} seconds. Stopping polling.")
                return None
        
            print(f"  Waiting {poll_interval} seconds before retry...")
            time.sleep(poll_interval)


if __name__ == "__main__":
    main()
