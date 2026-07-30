"""
Async S3 Service

Async wrapper for S3 operations used by the protocol layer.
"""

import asyncio
import os
from typing import List, Optional

from botocore.exceptions import ClientError

from scribe_core.storage import get_blob_store

from logs.custom_logger import get_logger

logger = get_logger(__name__)


class S3AsyncService:
    """
    Async wrapper for S3 operations.
    
    Provides async methods for S3 operations needed by the protocol layer.
    """
    
    def __init__(self):
        """Initialize S3 async service"""
        self.store = get_blob_store()  # backend-agnostic (local FS or S3)
    
    async def upload_file_async(
        self,
        bucket: str,
        key: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> dict:
        """
        Upload file to S3 asynchronously.
        
        Args:
            bucket: S3 bucket name
            key: S3 object key
            content: File content as bytes
            content_type: MIME type
            
        Returns:
            Upload result dict
        """
        loop = asyncio.get_event_loop()
        
        def _upload():
            return self.store.put(bucket, key, content, content_type=content_type)
        
        try:
            result = await loop.run_in_executor(None, _upload)
            logger.info(f"Uploaded file to s3://{bucket}/{key}", severity="medium")
            return {
                "success": True,
                "etag": result.get("ETag"),
            }
        except Exception as e:
            logger.error(f"Error uploading to S3: {e}", severity="critical")
            raise
    
    async def list_files_async(
        self,
        bucket: str,
        prefix: str,
    ) -> List[str]:
        """
        List files in S3 bucket with prefix asynchronously.
        
        Args:
            bucket: S3 bucket name
            prefix: Object key prefix
            
        Returns:
            List of object keys
        """
        loop = asyncio.get_event_loop()
        
        def _list():
            return self.store.list(bucket, prefix)
        
        try:
            files = await loop.run_in_executor(None, _list)
            return files
        except Exception as e:
            logger.error(f"Error listing S3 files: {e}", severity="medium")
            return []
    
    async def download_file_async(
        self,
        bucket: str,
        key: str,
    ) -> Optional[bytes]:
        """
        Download file from S3 asynchronously.
        
        Args:
            bucket: S3 bucket name
            key: S3 object key
            
        Returns:
            File content as bytes or None if error
        """
        loop = asyncio.get_event_loop()
        
        def _download():
            return self.store.get(bucket, key)
        
        try:
            content = await loop.run_in_executor(None, _download)
            return content
        except Exception as e:
            logger.error(f"Error downloading from S3: {e}", severity="medium")
            return None
