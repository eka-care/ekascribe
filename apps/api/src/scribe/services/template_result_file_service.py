"""
Template Result File Service - Handles file operations for template results

This service manages the new file-based storage architecture for template results:
- template_results/transcripts/{txn_id}_transcript.json - Individual transcript files
- template_results/templates/{template_id}.json - Individual template result files

Key responsibilities:
1. Read/write individual template result files
2. Read/write transcript files  
3. Aggregate multiple template files into single response
4. Provide fallback to legacy output.json for backward compatibility
5. Handle S3 folder operations for template_results structure
"""

import os
import warnings
from typing import Dict, Optional, Any, List
from scribe.core.custom_logger import get_logger
from scribe.repositories.s3_service import download_s3_file, upload_file_to_s3, s3_client
from scribe.repositories.s3_utils import list_files_in_s3_folder
from typing_extensions import deprecated

logger = get_logger(__name__)

# @deprecated("template result find service are now lagecy")
class TemplateResultFileService:

    def __init__(self, bucket_name: str = None):
        self.bucket_name = bucket_name or os.getenv("S3_VADED_BUCKET_NAME", "voice-records")
        logger.info(f"TemplateResultFileService initialized with bucket: {self.bucket_name}")
    
    def _get_base_folder(self, s3_url: str) -> str:
        folder_name = s3_url.removeprefix(f"s3://{self.bucket_name}/")
        if not folder_name.endswith("/"):
            folder_name += "/"
        return folder_name

    def get_template_file_path(self, s3_url: str, template_id: str) -> str:
        base_folder = self._get_base_folder(s3_url)
        return f"{base_folder}template_results/templates/{template_id}.json"

    def get_transcript_file_path(self, s3_url: str, txn_id: str, language_suffix: Optional[str] = None) -> str:
        base_folder = self._get_base_folder(s3_url)
        if language_suffix:
            return f"{base_folder}template_results/transcripts/{txn_id}_transcript_{language_suffix}.json"
        return f"{base_folder}template_results/transcripts/{txn_id}_transcript.json"

    def get_templates_folder_path(self, s3_url: str) -> str:
        base_folder = self._get_base_folder(s3_url)
        return f"{base_folder}template_results/templates/"

    def get_transcripts_folder_path(self, s3_url: str) -> str:
        base_folder = self._get_base_folder(s3_url)
        return f"{base_folder}template_results/transcripts/"

    def get_legacy_output_file_path(self, s3_url: str) -> str:
        base_folder = self._get_base_folder(s3_url)
        return f"{base_folder}output.json"

    def get_legacy_transcript_file_path(self, s3_url: str) -> str:
        base_folder = self._get_base_folder(s3_url)
        return f"{base_folder}logs/transcript.json"

    def read_template_file(
        self, 
        s3_url: str, 
        template_id: str, 
        txn_id: str,
        fallback_to_output_json: bool = True
    ) -> Optional[Dict[str, Any]]:
        try:
            file_path = self.get_template_file_path(s3_url, template_id)
            template_data = download_s3_file(
                self.bucket_name, 
                file_path, 
                f"template_{template_id}.json",
                txn_id
            )
            
            if template_data:
                logger.info(
                    "Template file read from new location",
                    txn_id=txn_id,
                    template_id=template_id,
                    file_path=file_path
                )
                return template_data

            if fallback_to_output_json:
                logger.info(
                    "Template file not found in new location, falling back to output.json",
                    txn_id=txn_id,
                    template_id=template_id
                )
                return self._read_template_from_output_json(s3_url, template_id, txn_id)

            return None

        except Exception as e:
            logger.error(
                "Error reading template file",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            if fallback_to_output_json:
                return self._read_template_from_output_json(s3_url, template_id, txn_id)
            return None

    def read_transcript_file(
        self, 
        s3_url: str, 
        txn_id: str,
        fallback_to_legacy: bool = True,
        language_suffix: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Read transcript file from S3.
        
        Args:
            s3_url: Base S3 URL for the transaction
            txn_id: Transaction ID
            fallback_to_legacy: If True, will try legacy location if new location fails (only for base transcript)
            language_suffix: Optional language code for multi-language transcripts (e.g., 'eng', 'hi')
        
        Returns:
            Transcript data or None if not found
        """
        try:
            file_path = self.get_transcript_file_path(s3_url, txn_id, language_suffix)
            filename = f"{txn_id}_transcript_{language_suffix}.json" if language_suffix else f"{txn_id}_transcript.json"
            
            transcript_data = download_s3_file(
                self.bucket_name,
                file_path,
                filename,
                txn_id
            )

            if transcript_data:
                logger.info(
                    "Transcript read from new location",
                    txn_id=txn_id,
                    language_suffix=language_suffix,
                    file_path=file_path
                )
                return transcript_data

            # only fallback to legacy for base transcript (not language-specific ones)
            if fallback_to_legacy and not language_suffix:
                logger.info(
                    "Transcript not found in new location, falling back to logs/transcript.json",
                    txn_id=txn_id
                )
                legacy_path = self.get_legacy_transcript_file_path(s3_url)
                legacy_data = download_s3_file(
                    self.bucket_name,
                    legacy_path,
                    "transcript.json",
                    txn_id
                )
                if legacy_data:
                    logger.info(
                        "Transcript found in legacy location",
                        txn_id=txn_id,
                        file_path=legacy_path
                    )
                return legacy_data

            logger.debug(
                "Transcript not found",
                txn_id=txn_id,
                language_suffix=language_suffix
            )
            return None

        except Exception as e:
            logger.error(
                "Error reading transcript file",
                txn_id=txn_id,
                language_suffix=language_suffix,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            # Try legacy fallback on exception (only for base transcript)
            if fallback_to_legacy and not language_suffix:
                try:
                    legacy_path = self.get_legacy_transcript_file_path(s3_url)
                    return download_s3_file(self.bucket_name, legacy_path, "transcript.json", txn_id)
                except:
                    pass
            return None

    def read_all_transcripts(
        self, 
        s3_url: str, 
        txn_id: str,
        fallback_to_legacy: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Read all transcript files from transcripts folder.
        
        Args:
            s3_url: Transaction S3 URL
            txn_id: Transaction ID
            fallback_to_legacy: Whether to fallback to legacy location for base transcript
            
        Returns:
            List of transcript objects:
            [
                {"text": "...", "lang": "..."},
                ...
            ]
        """
        try:
            transcripts_folder = self.get_transcripts_folder_path(s3_url)
            # list all files in transcripts folder
            transcript_files = list_files_in_s3_folder(
                s3_client,
                self.bucket_name,
                transcripts_folder,
                extension=".json"
            )

            results = []
            
            if not transcript_files:
                logger.info(
                    "No transcript files found in new location",
                    txn_id=txn_id,
                    folder=transcripts_folder
                )
                if fallback_to_legacy:
                    legacy_data = self.read_transcript_file(s3_url, txn_id, fallback_to_legacy=True)
                    if legacy_data:
                        results.append({
                            "text": legacy_data.get("text", ""),
                            "lang": ""
                        })
                return results

            # Filter for this txn_id and sort
            # {txn_id}_transcript.json should be first
            txn_transcripts = [k for k in transcript_files if f"{txn_id}_transcript" in k.split('/')[-1]]
            
            def sort_key(key):
                filename = key.split("/")[-1]
                if filename == f"{txn_id}_transcript.json":
                    return "" # empty string sorts before everything
                return filename

            txn_transcripts.sort(key=sort_key)

            for file_key in txn_transcripts:
                filename = file_key.split("/")[-1]
                # extract lang if it's f"{txn_id}_transcript_{lang}.json"
                lang = ""
                if "_transcript_" in filename:
                    lang = filename.replace(f"{txn_id}_transcript_", "").replace(".json", "")
                
                try:
                    transcript_data = download_s3_file(
                        self.bucket_name,
                        file_key,
                        filename,
                        txn_id
                    )
                    if transcript_data:
                        results.append({
                            "text": transcript_data.get("text", ""),
                            "lang": lang
                        })
                except Exception as e:
                    logger.error(
                        "Error reading individual transcript file",
                        txn_id=txn_id,
                        file_key=file_key,
                        error=str(e),
                        severity="medium",
                    )
                    continue
            
            # If no files found/read but fallback allowed, try legacy
            if not results and fallback_to_legacy:
                 legacy_data = self.read_transcript_file(s3_url, txn_id, fallback_to_legacy=True)
                 if legacy_data:
                    results.append({
                        "text": legacy_data.get("text", ""),
                        "lang": ""
                    })

            return results

        except Exception as e:
            logger.error(
                "Error reading all transcript files",
                txn_id=txn_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            return []


    def read_all_template_files(
        self, 
        s3_url: str, 
        txn_id: str,
        fallback_to_output_json: bool = True
    ) -> Dict[str, Any]:
        """
        Read all template files from templates folder and aggregate into output.json format.
        
        This method reads all individual template files and constructs a response
        similar to output.json format with structured_outputs.
        
        Args:
            s3_url: Transaction S3 URL
            txn_id: Transaction ID
            fallback_to_output_json: Whether to fallback to output.json if folder empty
            
        Returns:
            Dict with structure similar to output.json:
            {
                "structured_outputs": {
                    "template_id_1": "base64_value",
                    "template_id_2": "base64_value",
                    ...
                },
                "meta_information": {
                    "template_id_1": {"name": "...", "type": "..."},
                    ...
                }
            }
        """
        try:
            templates_folder = self.get_templates_folder_path(s3_url)
            
            # list all files in templates folder
            template_files = list_files_in_s3_folder(
                s3_client,
                self.bucket_name,
                templates_folder,
                extension=".json"
            )

            if not template_files:
                logger.info(
                    "No template files found in new location",
                    txn_id=txn_id,
                    folder=templates_folder
                )
                if fallback_to_output_json:
                    return self._read_legacy_output_json(s3_url, txn_id)
                return {"structured_outputs": {}, "meta_information": {}}

            logger.info(
                "Found template files in new location",
                txn_id=txn_id,
                count=len(template_files),
                folder=templates_folder
            )

            # aggregate all template files
            structured_outputs = {}
            meta_information = {}

            for file_key in template_files:
                try:
                    # extract template_id from filename (e.g., "template_id.json")
                    filename = file_key.split("/")[-1]
                    template_id = filename.replace(".json", "")

                    # read template file
                    template_data = download_s3_file(
                        self.bucket_name,
                        file_key,
                        filename,
                        txn_id
                    )

                    if template_data:
                        # extract value and metadata
                        structured_outputs[template_id] = template_data.get("value", "")
                        meta_information[template_id] = {
                            "name": template_data.get("name", template_id),
                            "type": template_data.get("type", "text"),
                            "status": template_data.get("status", "success"),
                            "errors": template_data.get("errors", []),
                            "warnings": template_data.get("warnings", [])
                        }

                except Exception as e:
                    logger.error(
                        "Error reading individual template file",
                        txn_id=txn_id,
                        file_key=file_key,
                        error=str(e),
                        severity="medium",
                    )
                    continue

            if not structured_outputs and fallback_to_output_json:
                logger.warning(
                    "Failed to read any template files, falling back to output.json",
                    txn_id=txn_id,
                    severity="medium",
                )
                return self._read_legacy_output_json(s3_url, txn_id)

            return {
                "structured_outputs": structured_outputs,
                "meta_information": meta_information
            }

        except Exception as e:
            logger.error(
                "Error reading all template files",
                txn_id=txn_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            if fallback_to_output_json:
                return self._read_legacy_output_json(s3_url, txn_id)
            return {"structured_outputs": {}, "meta_information": {}}

    def write_template_file(
        self,
        s3_url: str,
        template_id: str,
        template_data: Dict[str, Any],
        txn_id: str
    ) -> str:
        """
        Write individual template result file.

        .. deprecated::
            Use DocumentService.write_document_content() instead.

        Args:
            s3_url: Transaction S3 URL
            template_id: Template identifier
            template_data: Template data to write (should include value, status, errors, etc.)
            txn_id: Transaction ID

        Returns:
            File path if successful

        Raises:
            Exception: If file write fails
        """
        warnings.warn(
            "write_template_file is deprecated. Use DocumentService.write_document_content() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        try:
            file_path = self.get_template_file_path(s3_url, template_id)
            
            success = upload_file_to_s3(
                self.bucket_name,
                file_path,
                template_data,
                txn_id
            )

            if not success:
                raise Exception(f"Failed to upload template file to S3: {file_path}")

            logger.info(
                "Template file written successfully",
                txn_id=txn_id,
                template_id=template_id,
                file_path=file_path,
                severity="medium",
            )
            
            return file_path

        except Exception as e:
            logger.error(
                "Error writing template file",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    def write_transcript_file(
        self,
        s3_url: str,
        txn_id: str,
        transcript_data: Dict[str, Any],
        language_suffix: Optional[str] = None
    ) -> str:
        """
        Write transcript file to S3.

        .. deprecated::
            Use DocumentService.write_document_content() instead.

        Args:
            s3_url: Base S3 URL for the transaction
            txn_id: Transaction ID
            transcript_data: Transcript data to write
            language_suffix: Optional language code (e.g., 'eng', 'hi') for multi-language support

        Returns:
            S3 file path (without bucket name)

        Raises:
            Exception: If file write fails
        """
        warnings.warn(
            "write_transcript_file is deprecated. Use DocumentService.write_document_content() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        try:
            file_path = self.get_transcript_file_path(s3_url, txn_id, language_suffix)
            
            success = upload_file_to_s3(
                self.bucket_name,
                file_path,
                transcript_data,
                txn_id
            )

            if not success:
                raise Exception(f"Failed to upload transcript file to S3: {file_path}")

            logger.info(
                "Transcript file written successfully",
                txn_id=txn_id,
                language_suffix=language_suffix,
                file_path=file_path,
                severity="medium",
            )
            
            return file_path

        except Exception as e:
            logger.error(
                "Error writing transcript file",
                txn_id=txn_id,
                language_suffix=language_suffix,
                error=str(e),
                exc_info=True,
                severity="critical",
            )
            raise

    def copy_transcript_from_legacy(
        self,
        s3_url: str,
        txn_id: str
    ) -> str:
        """
        Copy transcript from legacy location (logs/transcript.json) to new location.

        .. deprecated::
            Use populate_documents(migrate=True) instead.

        Args:
            s3_url: Transaction S3 URL
            txn_id: Transaction ID

        Returns:
            New file S3 URL (s3://bucket/path)

        Raises:
            Exception: If transcript not found or copy fails
        """
        warnings.warn(
            "copy_transcript_from_legacy is deprecated. Use populate_documents(migrate=True) instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        try:
            legacy_path = self.get_legacy_transcript_file_path(s3_url)
            transcript_data = download_s3_file(
                self.bucket_name,
                legacy_path,
                "transcript.json",
                txn_id
            )

            if not transcript_data:
                raise Exception(f"Transcript not found in legacy location: {legacy_path}")

            # Write to new location (returns path or raises exception)
            new_path = self.write_transcript_file(s3_url, txn_id, transcript_data)
            
            logger.info(
                "Transcript copied from legacy to new location",
                txn_id=txn_id,
                from_path=legacy_path,
                to_path=new_path
            )
            
            return f"s3://{self.bucket_name}/{new_path}"

        except Exception as e:
            logger.error(
                "Error copying transcript from legacy location",
                txn_id=txn_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

    def copy_template_from_output_json(
        self,
        s3_url: str,
        template_id: str,
        txn_id: str,
        output_template_result: Dict[str, Any] = None
    ) -> str:
        """
        Copy template data from output.json to individual template file.

        .. deprecated::
            Use populate_documents() instead.

        Args:
            s3_url: Transaction S3 URL
            template_id: Template identifier
            txn_id: Transaction ID
            output_template_result: Optional template metadata (status, errors, warnings)

        Returns:
            New file S3 URL (s3://bucket/path)

        Raises:
            Exception: If output.json not found, template not found, or copy fails
        """
        warnings.warn(
            "copy_template_from_output_json is deprecated. Use populate_documents() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        try:
            # Read output.json
            output_json = self._read_legacy_output_json(s3_url, txn_id)
            
            if not output_json:
                raise Exception(f"output.json not found for transaction {txn_id}")

            structured_outputs = output_json.get("structured_outputs", {})
            meta_info = output_json.get("meta_information", {})

            if template_id not in structured_outputs:
                raise Exception(f"Template {template_id} not found in output.json")

            # Build template data structure
            template_data = {
                "template_id": template_id,
                "value": structured_outputs[template_id],
                "type": meta_info.get(template_id, {}).get("type", "text"),
                "name": meta_info.get(template_id, {}).get("name", template_id),
                "status": "success",
                "errors": [],
                "warnings": []
            }

            # Add metadata from output_template_result if provided
            if output_template_result:
                template_info = output_template_result.get(template_id, {})
                template_data["status"] = template_info.get("status", "success")
                template_data["errors"] = template_info.get("errors", [])
                template_data["warnings"] = template_info.get("warnings", [])

            # Write to new location (returns path or raises exception)
            new_path = self.write_template_file(s3_url, template_id, template_data, txn_id)
            
            logger.info(
                "Template copied from output.json to new location",
                txn_id=txn_id,
                template_id=template_id,
                to_path=new_path
            )
            
            return f"s3://{self.bucket_name}/{new_path}"

        except Exception as e:
            logger.error(
                "Error copying template from output.json",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                exc_info=True,
                severity="medium",
            )
            raise

    def _read_template_from_output_json(
        self,
        s3_url: str,
        template_id: str,
        txn_id: str
    ) -> Optional[Dict[str, Any]]:
        """Read specific template from output.json (legacy format)."""
        try:
            output_json = self._read_legacy_output_json(s3_url, txn_id)
            if not output_json:
                return None

            structured_outputs = output_json.get("structured_outputs", {})
            meta_info = output_json.get("meta_information", {})

            if template_id not in structured_outputs:
                return None

            return {
                "template_id": template_id,
                "value": structured_outputs[template_id],
                "type": meta_info.get(template_id, {}).get("type", "text"),
                "name": meta_info.get(template_id, {}).get("name", template_id),
                "status": meta_info.get(template_id, {}).get("status", "success"),
                "errors": meta_info.get(template_id, {}).get("errors", []),
                "warnings": meta_info.get(template_id, {}).get("warnings", [])
            }

        except Exception as e:
            logger.error(
                "Error reading template from output.json",
                txn_id=txn_id,
                template_id=template_id,
                error=str(e),
                severity="critical",
            )
            return None

    def _read_legacy_output_json(
        self,
        s3_url: str,
        txn_id: str
    ) -> Optional[Dict[str, Any]]:
        """Read legacy output.json file."""
        try:
            file_path = self.get_legacy_output_file_path(s3_url)
            return download_s3_file(
                self.bucket_name,
                file_path,
                "output.json",
                txn_id
            )
        except Exception as e:
            logger.error(
                "Error reading legacy output.json",
                txn_id=txn_id,
                error=str(e),
                severity="critical",
            )
            return None
