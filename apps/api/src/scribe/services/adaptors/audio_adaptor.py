"""
Audio Adaptor

Handles audio upload operations for different upload types:
- Chunked: Multiple sequential uploads to s3_url
- Single: One complete file upload to batch_s3_url

Integrates with S3 for storage using direct s3_client.
"""
import asyncio
import os
import re
from typing import Any, Dict, List



from scribe.core.custom_logger import get_logger

from scribe.schemas import UploadType
from scribe.services.transaction_service import TransactionService
logger = get_logger(__name__)

class AudioAdaptor:
    """
    Adaptor for handling audio uploads according to protocol specification.
    
    Supports:
    - Chunked uploads (multiple files with sequence numbers) to s3_url
    - Single file uploads (one complete file) to batch_s3_url
    """
    
    def __init__(self):
        """Initialize audio adaptor."""
        # self.s3_bucket = os.getenv("S3_BUCKET_NAME", "voice2rx-audio")
        
        # Audio format configuration
        self.supported_formats = [
            "audio/webm;codecs=opus",
            "audio/wav",
            "audio/ogg",
            "audio/ogg;codecs=opus",
            "audio/mp4",
            "audio/m4a",
            "audio/mp3"
        ]
        
        self.max_chunk_duration_seconds = 20
        self.max_chunk_size_bytes = 10 * 1024 * 1024  # 10MB
        # Backend-agnostic blob store (local FS or S3/MinIO) — plan B2.
        from scribe_core.storage import get_blob_store

        self.store = get_blob_store()
        self.transaction_service = TransactionService()

    
    def _extract_sequence_and_extension(self, filename: str) -> tuple[int, str]:
        """
        Extract sequence number and extension from filename.
        Examples:
            audio_0.webm → (0, 'webm')
            chunk_1.mp3 → (1, 'mp3')
            recording_2.wav → (2, 'wav')
        
        Args:
            filename: Original filename
            
        Returns:
            Tuple of (sequence_number, extension)
        """
        match = re.search(r'_(\d+)\.([a-zA-Z0-9]+)$', filename)
        if match:
            return int(match.group(1)), match.group(2)
        raise ValueError(f"Cannot extract sequence number from filename: {filename}")
    
    def _parse_s3_url(self, s3_url: str) -> tuple[str, str]:
        """
        Parse S3 URL to extract bucket and key prefix.
        Args:
            s3_url: S3 URL (e.g., s3://bucket-name/prefix/path/)
            
        Returns:
            Tuple of (bucket, key_prefix)
        """
        if not s3_url.startswith('s3://'):
            raise ValueError(f"Invalid S3 URL: {s3_url}")
        
        path = s3_url[5:]
        parts = path.split('/', 1)
        bucket = parts[0]
        key_prefix = parts[1] if len(parts) > 1 else ''
        
        return bucket, key_prefix
    
    async def upload_audio_file(
        self,
        session_data: Dict[str, Any],
        filename: str,
        content: bytes,
        content_type: str,
        upload_type: UploadType,
    ) -> Dict[str, Any]:
        """
        Upload audio file to S3 with metadata.
        
        For chunked upload:
            - Validates filename format (e.g., audio_0.webm)
            - Uploads to s3_url from session_data
            - Saves as 0.webm, 1.webm, 2.webm, etc.
        
        For single upload:
            - No filename validation
            - Uploads to batch_s3_url from session_data
            - Saves as 0.ext (single file)
        
        Args:
            session_data: Session data containing s3_url/batch_s3_url
            filename: Original filename
            content: Audio file content
            content_type: MIME type
            upload_type: Upload type (chunked or single)
            
        Returns:
            Upload result dict with simplified filename
        """
        session_id = session_data.get("txn_id", "")
        b_id = session_data.get("b_id", "")
        
        if content_type not in self.supported_formats:
            raise ValueError(
                f"Unsupported audio format: {content_type}. "
                f"Supported formats: {', '.join(self.supported_formats)}"
            )
        
        if upload_type == UploadType.CHUNKED:
            if not self._validate_chunk_filename(filename):
                raise ValueError(
                    f"Invalid chunk filename: {filename}. "
                    "Expected format: <base>_<number>.<ext> (e.g., audio_0.webm)"
                )
            
            sequence, extension = self._extract_sequence_and_extension(filename)
            simple_filename = f"{sequence}.{extension}"
            s3_url = session_data.get("s3_url", "")
            if not s3_url:
                raise ValueError("s3_url not found in session data")
        else:
            # extension = filename.split('.')[-1] if '.' in filename else 'mp3'
            # simple_filename = f"0.{extension}"
            simple_filename = filename
            s3_url = session_data.get("batch_s3_url", "")
            if not s3_url:
                raise ValueError("batch_s3_url not found in session data")
        
        bucket, key_prefix = self._parse_s3_url(s3_url)
        s3_key = f"{key_prefix}/{simple_filename}"       
        
        try:
            loop = asyncio.get_event_loop()

            def _upload():
                return self.store.put(
                    bucket,
                    s3_key,
                    content,
                    content_type=content_type,
                    metadata={"bid": b_id, "txnid": session_id},
                )

            _ = await loop.run_in_executor(None, _upload)
            logger.info(
                "Audio uploaded successfully",
                session_id=session_id,
                b_id=b_id,
                original_file=filename, 
                s3_file=simple_filename,
                s3_key=s3_key,
                size_bytes=len(content),
                upload_type=upload_type.value,
                severity="medium",
            )
            
            return {
                "success": True,
                "filename": simple_filename,
                "original_filename": filename,
                "s3_key": s3_key,
                "size_bytes": len(content),
            }
            
        except Exception as e:
            logger.error(
                f"Error uploading audio: {e}",
                session_id=session_id,
                b_id=b_id,
                original_file=filename,  # Changed from filename to avoid LogRecord conflict
                exc_info=True,
                severity="critical",
            )
            raise
    
    def update_transaction(self, session_id: str, b_id: str, update_data: Dict[str, Any]) -> None:
        return self.transaction_service.update_transaction(session_id, b_id, update_data)
    
    def send_to_sns_for_vadding(self, item_data: Dict[str, Any], txn_id: str, b_id: str) -> None:
        return self.transaction_service._publish_to_sns_for_vadding(item_data, txn_id, b_id)

    def _validate_chunk_filename(self, filename: str) -> bool:
        """
        Validate chunk filename format.
        
        Expected: <base>_<number>.<ext>
        Examples: audio_0.webm, chunk_1.wav, recording_2.ogg
        
        Args:
            filename: Filename to validate
            
        Returns:
            True if valid format
        """
        import re
        pattern = r'^[a-zA-Z0-9_-]+_\d+\.[a-zA-Z0-9]+$'
        return bool(re.match(pattern, filename))
    
    def validate_audio_format(self, content_type: str) -> bool:
        """
        Validate audio format is supported.
        
        Args:
            content_type: MIME type
            
        Returns:
            True if supported
        """
        return content_type in self.supported_formats
    
    def get_supported_formats(self) -> List[str]:
        """
        Get list of supported audio formats.
        
        Returns:
            List of supported MIME types
        """
        return self.supported_formats.copy()

    def get_existing_chunk_count(self, s3_url: str) -> int:
        """
        Get the current max chunk index from the vaded S3 bucket for a session.
        
        Lists objects in the S3 prefix and finds the highest numeric filename
        (e.g., 1.m4a, 2.m4a, 3.m4a → returns 3).
        
        Args:
            s3_url: S3 URL pointing to the vaded bucket session folder.
            
        Returns:
            The highest existing chunk index, or 0 if no chunks exist.
        """
        try:
            bucket, prefix = self._parse_s3_url(s3_url)
            # Ensure prefix ends with /
            if prefix and not prefix.endswith('/'):
                prefix += '/'

            keys = self.store.list(bucket, prefix)
            if not keys:
                return 0

            max_index = 0
            for key in keys:
                filename = key.split('/')[-1]
                # Extract numeric part from filenames like "1.m4a", "2.m4a"
                base_name = filename.split('.')[0] if '.' in filename else filename
                if base_name.isdigit():
                    max_index = max(max_index, int(base_name))
            
            return max_index
            
        except Exception as e:
            logger.error(
                "Error getting existing chunk count",
                s3_url=s3_url,
                error=str(e),
                severity="medium",
            )
            return 0

    async def vad_and_upload_chunks(
        self,
        session_data: Dict[str, Any],
        audio_content: bytes,
        session_id: str,
        b_id: str,
    ) -> Dict[str, Any]:
        """
        Perform inline VAD chunking on audio and upload chunks to the vaded S3 bucket.
        
        This replaces the SNS-based external VAD workflow for single uploads.
        Chunks are numbered starting from the next available index (to support
        multiple single uploads in the same session).
        
        Args:
            session_data: Session data containing s3_url and batch_s3_url.
            audio_content: Raw audio file bytes.
            session_id: Session/transaction ID.
            b_id: Business ID.
            
        Returns:
            Dict with chunk count and uploaded file URLs.
        """
        from scribe.services.vad_chunking_service import VADChunkingService
        s3_url = session_data.get("s3_url", "")
        if not s3_url:
            raise ValueError("s3_url not found in session data for VAD output")

        loop = asyncio.get_event_loop()

        existing_max_index = await loop.run_in_executor(
            None, self.get_existing_chunk_count, s3_url
        )
        start_index = existing_max_index + 1

        logger.info(
            "Starting inline VAD chunking",
            session_id=session_id,
            b_id=b_id,
            start_index=start_index,
            existing_chunks=existing_max_index,
        )

        vad_service = VADChunkingService()

        def _run_vad():
            return vad_service.chunk_audio(
                audio_bytes=audio_content,
                start_index=start_index,
            )

        chunks, audio_index = await loop.run_in_executor(None, _run_vad)
        bucket, key_prefix = self._parse_s3_url(s3_url)
        if key_prefix and key_prefix.endswith('/'):
            key_prefix = key_prefix.rstrip('/')

        uploaded_files = []
        metadata = {
            'bid': str(b_id) if b_id else '',
            'txnid': str(session_id),
        }

        for chunk_index, chunk_bytes, chunk_meta in chunks:
            output_key = f"{key_prefix}/{chunk_index}.m4a"

            def _upload_chunk(key=output_key, body=chunk_bytes, meta=metadata):
                return self.store.put(
                    bucket, key, body, content_type='audio/mp4', metadata=meta
                )

            await loop.run_in_executor(None, _upload_chunk)

            file_url = f"s3://{bucket}/{output_key}"
            uploaded_files.append(file_url)

            logger.info(
                "VAD chunk uploaded",
                session_id=session_id,
                b_id=b_id,
                chunk_index=chunk_index,
                s3_key=output_key,
            )

        logger.info(
            "Inline VAD chunking completed",
            session_id=session_id,
            b_id=b_id,
            total_chunks=len(chunks),
            uploaded_files=uploaded_files,
            severity="medium",
        )

        return {
            "chunk_count": len(chunks),
            "uploaded_files": uploaded_files,
            "audio_index": audio_index,
            "start_index": start_index,
        }

    def generate_presigned_post_for_upload(
        self,
        session_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        txn_id = session_data.get("txn_id", "")
        b_id = session_data.get("b_id", "")
        upload_type = session_data.get("upload_type", "single")

        if upload_type == "chunked":
            target_url = session_data.get("s3_url", "")
            if not target_url:
                raise ValueError("s3_url not found in session data for chunked upload")
        else:
            target_url = session_data.get("batch_s3_url", "")
            if not target_url:
                raise ValueError("batch_s3_url not found in session data for single upload")

        bucket, prefix = self._parse_s3_url(target_url)

        prefix = prefix.rstrip("/")
        folder_path = f"{prefix}/"

        # Backend-agnostic: LocalFS returns an S3-POST-shaped dict targeting the
        # API's blob-upload endpoint; S3 returns a real presigned POST
        # (assume-role only when ASSUME_ROLE_ARN is configured). Plan A4.
        response = self.store.presigned_post(
            bucket,
            prefix,
            metadata={"bid": b_id, "txnid": txn_id},
            expires_in=10800,
        )

        logger.info(
            "Generated presigned POST for upload",
            txn_id=txn_id,
            b_id=b_id,
            bucket=bucket,
            folder_path=folder_path,
            upload_type=upload_type,
        )

        return {
            "uploadData": {
                "url": response["url"],
                "fields": response["fields"],
            },
            "folderPath": folder_path,
            "txn_id": txn_id,
        }
