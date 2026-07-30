import boto3
from botocore.exceptions import NoCredentialsError, ClientError
import os
import tempfile
import shutil
from logs.custom_logger import get_logger
from pydub import AudioSegment
from typing import List, Tuple
import logging

logging.basicConfig(level=logging.INFO)
logger = get_logger(__name__)

# combine s3 audio files into a single file and upload back to S3 using boto3 and pydub
class S3AudioCombiner:
    def __init__(self):
        self.s3_client = boto3.client("s3", region_name="ap-south-1")
        self.destination_bucket = os.getenv("S3_COMBINED_AUDIO_BUCKET", "voice-records-audio")

    def _parse_s3_path(self, s3_path: str) -> Tuple[str, str]:
        if s3_path.startswith("s3://"):
            s3_path = s3_path[5:]
        
        if "/" not in s3_path:
            return s3_path, ""
        parts = s3_path.split("/", 1)
        return parts[0], parts[1]


    def upload_binary_file_to_s3(
        self, bucket_name: str, file_key: str, file_path: str, content_type: str = None
    ) -> bool:
        try:
            extra_args = {}
            if content_type:
                extra_args["ContentType"] = content_type
            elif file_path.endswith(".mp3"):
                extra_args["ContentType"] = "audio/mpeg"
            elif file_path.endswith(".m4a"):
                extra_args["ContentType"] = "audio/mp4"

            logger.info(
                f"Uploading file {file_path} to {file_key} in bucket {bucket_name}"
            )
            self.s3_client.upload_file(
                file_path, bucket_name, file_key, ExtraArgs=extra_args
            )
            logger.info(f"Successfully uploaded {file_key}", severity="medium")
            return True
        except Exception as e:
            logger.error(f"Failed to upload file: {e}", severity="critical")
            return False

    def _get_numeric_files(self, bucket: str, prefix: str) -> List[Tuple[int, str]]:
        paginator = self.s3_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket, Prefix=prefix)

        numeric_files = []
        for page in pages:
            if "Contents" not in page:
                continue

            for obj in page["Contents"]:
                s3_key = obj["Key"]
                if s3_key.endswith("/"):
                    continue

                if not (s3_key.endswith(".mp3") or s3_key.endswith(".m4a")):
                    continue
                filename = os.path.basename(s3_key)
                base_name = os.path.splitext(filename)[0]

                if base_name.isdigit():
                    numeric_files.append((int(base_name), s3_key))
                else:
                    logger.warning(f"Skipping non-numeric file: {filename}", severity="medium")

        numeric_files.sort(key=lambda x: x[0])
        return numeric_files

    def combine_audio_from_s3(
        self,
        txn_id: str,
        b_id: str,
        source_s3_path: str,
        destination_s3_path: str,
        output_format: str = "mp3",
        bitrate: str = "192k",
    ) -> dict:
        """
        Download audio files from S3, combine them, and upload to destination S3
        Args:
            source_s3_path: S3 path containing source files (bucket/prefix)
            destination_s3_path: S3 path for combined file (bucket/key)
            output_format: Output format (mp3, wav, m4a)
            bitrate: Output bitrate for compressed formats
            upload_function: Custom function to upload file (bucket, key, file_path)
                           If None, uses built-in upload

        Returns:
            dict with status, file_count, duration, and output_path
        """
        temp_dir = None
        try:
            source_bucket, source_prefix = self._parse_s3_path(source_s3_path)
            dest_bucket, dest_key = self._parse_s3_path(destination_s3_path)

            logger.info(
                f"Starting audio combination from {source_s3_path}, txn_id={txn_id}, b_id={b_id}"
            )
            numeric_files = self._get_numeric_files(source_bucket, source_prefix)

            if not numeric_files:
                logger.error(
                    f"No Audio Files Found for the transaction {txn_id}, b_id={b_id}",
                    severity="critical",
                )
                return {
                    "status": "error",
                    "message": "No numeric audio files found",
                    "file_count": 0,
                }

            logger.info(
                f"Found {len(numeric_files)} audio files, txn_id={txn_id}, b_id={b_id}"
            )
            # create a temporary directory to store the chunked audio files
            temp_dir = tempfile.mkdtemp(prefix="audio_combine_" + txn_id)
            # Download and combine files in streaming fashion
            combined = AudioSegment.empty()
            for idx, (num, s3_key) in enumerate(numeric_files, 1):
                # download the audio files from s3 to a temporary file
                filename = os.path.basename(s3_key)
                temp_file = os.path.join(temp_dir, filename)

                logger.info(
                    f"Processing {idx}/{len(numeric_files)}: {filename}, txn_id={txn_id}, b_id={b_id}"
                )
                self.s3_client.download_file(source_bucket, s3_key, temp_file)

                audio = AudioSegment.from_file(temp_file)
                combined += audio

                # Clean up temp file immediately to save space
                os.remove(temp_file)

            # Export combined audio
            output_file = os.path.join(temp_dir, f"combined_{txn_id}.{output_format}")
            export_params = {"format": output_format}
            if output_format in ["mp3", "m4a"]:
                export_params["bitrate"] = bitrate

            logger.info(
                f"Exporting combined audio ({len(combined) / 1000:.2f}s), txn_id={txn_id}, b_id={b_id}"
            )

            combined.export(output_file, **export_params)
            upload_success = self.upload_binary_file_to_s3(dest_bucket, dest_key, output_file)
            if not upload_success:
                logger.error(f"Failed to upload combined audio to S3, txn_id={txn_id}, b_id={b_id}", severity="critical")
                return {"status": "error", "message": "Failed to upload combined audio to S3"}

            result = {
                "status": "success",
                "file_count": len(numeric_files),
                "duration_seconds": len(combined) / 1000,
                "output_path": destination_s3_path,
                "output_size_mb": os.path.getsize(output_file) / (1024 * 1024),
            }

            logger.info(
                f"Successfully combined {len(numeric_files)} files, txn_id={txn_id}, b_id={b_id}",
                severity="medium",
            )
            return result

        except NoCredentialsError:
            logger.error("Invalid AWS credentials, txn_id={txn_id}, b_id={b_id}", severity="critical")
            return {"status": "error", "message": "Invalid AWS credentials"}

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            logger.error(f"AWS Error: {error_code}, txn_id={txn_id}, b_id={b_id}", severity="critical")
            return {"status": "error", "message": f"AWS Error: {error_code}"}

        except Exception as e:
            logger.error(
                f"Unexpected error: {str(e)}, txn_id={txn_id}, b_id={b_id}",
                exc_info=True,
                severity="critical",
            )
            return {"status": "error", "message": str(e)}

        finally:  # cleanup temp director
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
                logger.info(f"Temp files kept at: {temp_dir}") 
                logger.info("Cleaned up temporary files, txn_id={txn_id}, b_id={b_id}")

async def background_audio_combine_task(
    txn_id: str,
    b_id: str,
    source_s3_path: str,
    destination_s3_path: str = None
):
    """
    Background task for FastAPI to combine audio files
    Usage in FastAPI:
        @app.post("/combine-audio")
        async def combine_audio(background_tasks: BackgroundTasks):
            background_tasks.add_task(
                background_audio_combine_task,
                source_s3_path="bucket/source/prefix",
                destination_s3_path="bucket/output/combined.mp3",
                credentials={...}
            )
            return {"message": "Processing started"}
    """
    if destination_s3_path is None:
        destination_s3_bucket= os.getenv("S3_COMBINED_AUDIO_BUCKET", "voice-records-audio")
        destination_s3_path = f"s3://{destination_s3_bucket}/{b_id}/{txn_id}_combined.mp3"

    if not source_s3_path:
        logger.error(f"Source S3 path is required, txn_id={txn_id}, b_id={b_id}", severity="medium")
        return {"status": "error", "message": "Source S3 path is required"}

    combiner = S3AudioCombiner()
    result = combiner.combine_audio_from_s3(
        txn_id=txn_id,
        b_id=b_id,
        source_s3_path=source_s3_path,
        destination_s3_path=destination_s3_path,
        output_format="mp3",
        bitrate="192k",
    )
    logger.info(f"Background task completed: {result}", severity="medium")
    return result


if __name__ == "__main__":
    combiner = S3AudioCombiner()

    source_s3_path = "s3://m-pp-voice2rx/251208/sc-c2ed2392-0745-4a40-a6fa-2dddbba5af9d"
    destination_s3_path = "s3://m-dev-voice-record-audio/7175974303217273/sc-c2ed2392-0745-4a40-a6fa-2dddbba5af9d.mp3"

    result = combiner.combine_audio_from_s3(
        txn_id="sc-c2ed2392-0745-4a40-a6fa-2dddbba5af9d",
        b_id="vicky-testing",
        source_s3_path=source_s3_path,
        destination_s3_path=destination_s3_path,
        output_format="mp3",
        bitrate="192k"
    )

    print(result)

