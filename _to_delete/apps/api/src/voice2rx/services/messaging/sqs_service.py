import json

import boto3

from botocore.exceptions import ClientError

import json
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert Decimal to float (or str if you want exact match)
            return float(obj)
        return super(DecimalEncoder, self).default(obj)



class SQSService:
    def __init__(self, region_name="ap-south-1"):
        self._region = region_name
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = boto3.client("sqs", region_name=self._region)
        return self._client

    # Cloud queue name → on-prem worker task name (plan B3).
    QUEUE_TASK_MAP = {"voice2rx": "process_session"}

    def send_message(self, queue_name, message_body):
        """
        Send a message to the job queue.

        On QUEUE_BACKEND=postgres the message becomes a procrastinate job for
        apps/worker (same payload the ds-service consumed from SQS). On sqs it
        goes to the named SQS queue exactly as before.
        """
        from scribe_core.settings import get_settings
        if get_settings().queue_backend == "postgres":
            try:
                from voice2rx.background.dispatch import dispatch

                task = self.QUEUE_TASK_MAP.get(queue_name, queue_name)
                payload = json.loads(json.dumps(message_body, cls=DecimalEncoder))
                dispatch(task, {"message": payload})
                return {"success": True, "message_id": f"pg:{task}"}
            except Exception as e:
                return {"success": False, "error": str(e)}
        try:
            # Get the queue URL
            queue_url = self.client.get_queue_url(QueueName=queue_name)["QueueUrl"]
            message_body = json.dumps(message_body, cls=DecimalEncoder)

            # Send the message
            response = self.client.send_message(
                QueueUrl=queue_url, MessageBody=message_body
            )

            response = {"success": True, "message_id": response.get("MessageId"), "response": response, "message_body": message_body}
            print("msg sent to sqs ==", response)
            return response
        except ClientError as e:
            return {"success": False, "error": str(e)}

    def send_batch_messages(self, queue_name, messages):
        """
        Send a batch of messages to an SQS queue (up to 10 at a time)

        Args:
            queue_name: Name of the SQS queue
            messages: List of message bodies to send

        Returns:
            dict: Response from SQS with success and failure counts
        """
        try:
            # Get the queue URL
            queue_url = self.client.get_queue_url(QueueName=queue_name)["QueueUrl"]

            # Prepare batch entries (max 10 per batch)
            entries = []
            for i, msg in enumerate(messages[:10]):  # SQS allows max 10 messages per batch
                entries.append({"Id": str(i), "MessageBody": json.dumps(msg, cls=DecimalEncoder)})


            if not entries:
                return {"success": False, "error": "No valid messages to send"}

            # Send the batch
            response = self.client.send_message_batch(QueueUrl=queue_url, Entries=entries)
            print("entries sent to sqs == ", entries)

            return {
                "success": True,
                "successful": len(response.get("Successful", [])),
                "failed": len(response.get("Failed", [])),
                "response": response,
            }
        except ClientError as e:
            return {"success": False, "error": str(e)}

    def get_queue_url(self, queue_name):
        try:
            return self.client.get_queue_url(QueueName=queue_name)["QueueUrl"]
        except ClientError as e:
            return None
