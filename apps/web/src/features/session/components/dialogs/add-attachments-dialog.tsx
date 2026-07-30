'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, FileText, Check, Eye } from 'lucide-react';
import { MedicalRecordsClient, DocumentItem } from '@eka-care/medical-records-ts-sdk';
import { medicalRecordSDKConfig } from '@/constants/constant';
import { useFilePicker } from '@/platform';
import { MAX_ATTACHMENTS } from '../../hooks/use-session-context';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpg',
  'image/png': 'image/png',
};

export type TAttachedDocument = {
  documentId: string;
  name: string;
};

interface AddAttachmentsDialogProps {
  onClose: () => void;
  onAttach: (doc: TAttachedDocument) => void;
  onRemoveAttachment?: () => void;
  patientOid?: string;
  bid?: string;
  alreadyAttachedId?: string;
}

const AddAttachmentsDialog = ({
  onClose,
  onAttach,
  onRemoveAttachment,
  patientOid,
  bid = '',
  alreadyAttachedId,
}: AddAttachmentsDialogProps) => {
  const [existingDocs, setExistingDocs] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(alreadyAttachedId || null);
  const [selectedDocName, setSelectedDocName] = useState('');
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<TAttachedDocument | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const filePicker = useFilePicker();

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Fetch existing patient documents
  useEffect(() => {
    if (!patientOid) return;
    setLoadingDocs(true);
    const client = new MedicalRecordsClient(medicalRecordSDKConfig);
    client
      .listDocuments({
        patientId: patientOid!,
        bid,
        preferenceType: 'HTML',
      })
      .then((docs) => setExistingDocs(docs || []))
      .catch(() => setExistingDocs([]))
      .finally(() => setLoadingDocs(false));
  }, [patientOid]);

  const handleFileUpload = async (file: File) => {
    setUploadError(null);

    if (!ALLOWED_TYPES[file.type]) {
      setUploadError('Supported formats: PDF, JPG, PNG');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File size must be under 10MB');
      return;
    }

    setIsUploading(true);
    try {
      const client = new MedicalRecordsClient(medicalRecordSDKConfig);
      const response = await client.addDocument({
        batchRequests: [
          {
            files: [{ contentType: ALLOWED_TYPES[file.type] || file.type, file_size: file.size }],
            title: file.name,
          },
        ],
        files: [[file]],
        bid,
        patientId: patientOid!,
      });

      const documentId = response.batch_response?.[0]?.document_id;
      if (documentId) {
        if (alreadyAttachedId && selectedDocId === alreadyAttachedId) {
          onRemoveAttachment?.();
        }
        setUploadedDoc({ documentId, name: file.name });
        setSelectedDocId(documentId);
        setSelectedDocName(file.name);
      } else {
        setUploadError('Upload failed');
      }
    } catch {
      setUploadError('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePickFile = async () => {
    if (isFull) return;
    const files = await filePicker.pickFiles({ accept: ACCEPTED_EXTENSIONS });
    const file = files[0];
    if (file) handleFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && !isFull) handleFileUpload(file);
  };

  const toggleDoc = (docId: string, docName: string) => {
    const isAlreadyAttached = docId === alreadyAttachedId;
    if (selectedDocId === docId) {
      // Deselect — if this doc is already an attachment, remove it.
      if (isAlreadyAttached) onRemoveAttachment?.();
      setSelectedDocId(null);
      setSelectedDocName('');
    } else {
      // Select — single selection mode, auto-deselect previous
      if (alreadyAttachedId && selectedDocId === alreadyAttachedId) {
        onRemoveAttachment?.();
      }
      setSelectedDocId(docId);
      setSelectedDocName(docName);
    }
  };

  const handleConfirm = () => {
    if (!selectedDocId) return;
    // Only call onAttach for newly selected docs
    if (selectedDocId !== alreadyAttachedId) {
      onAttach({ documentId: selectedDocId, name: selectedDocName || 'Document' });
    } else {
      onClose();
    }
  };

  const isFull = !!selectedDocId;

  return (
    <div
      ref={dialogRef}
      className="w-[calc(100vw-2rem)] max-w-[324px] p-4 bg-white border max-h-80 border-[#D1D1D1] rounded-lg flex flex-col gap-3"
      style={{
        boxShadow: '0px 4px 6px -4px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1)',
      }}
    >
      <p className="text-base font-semibold text-[#1A1A1A] leading-6">Add attachment</p>

      {/* Upload area / uploaded file preview */}
      {uploadedDoc ? (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-[#EDEDED] rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[#767676] shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-[#1A1A1A] truncate">
                {uploadedDoc.name}
              </span>
              <span className="text-xs text-[#767676]">Uploaded successfully</span>
            </div>
          </div>
          <button
            onClick={() => {
              setUploadedDoc(null);
              setSelectedDocId(alreadyAttachedId || null);
              setSelectedDocName('');
            }}
            className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
          >
            <X className="w-4 h-4 text-[#767676]" />
          </button>
        </div>
      ) : isUploading ? (
        <div className="flex items-center gap-2 p-2.5 bg-[#EDEDED] rounded-lg">
          <Loader2 className="w-4 h-4 text-[#767676] animate-spin shrink-0" />
          <span className="text-sm text-[#1A1A1A]">Uploading...</span>
        </div>
      ) : (
        <div
          onClick={handlePickFile}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border border-dashed transition-colors ${
            isFull
              ? 'border-[#D1D1D1] opacity-40 cursor-not-allowed'
              : 'border-[#D1D1D1] hover:border-[#215FFF] hover:bg-[#F5F8FF] cursor-pointer'
          }`}
        >
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#767676]" />
            <p className="text-sm text-[#1A1A1A] text-center" style={{ textWrap: 'balance' }}>
              Click to upload or drag and drop
            </p>
          </div>
          <p className="text-xs text-[#767676] text-center" style={{ textWrap: 'balance' }}>
            PDF, JPG, PNG - max 10MB
          </p>
        </div>
      )}

      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

      {/* Separator + existing patient documents */}
      {patientOid && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-[#D1D1D1]" />
            <span className="text-xs text-[#767676]">or select from records</span>
            <div className="flex-1 h-px bg-[#D1D1D1]" />
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto">
            {loadingDocs && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#767676]" />
              </div>
            )}
            {!loadingDocs && existingDocs.length === 0 && (
              <p className="text-sm text-[#767676]">No documents found</p>
            )}
            {!loadingDocs &&
              existingDocs.slice(0, 5).map((doc) => {
                const docId = doc.document_id;
                const docName = doc.metadata?.title || 'Untitled document';
                const thumbnail = doc.metadata?.thumbnail;
                const isSelected = selectedDocId === docId;
                const isDisabled = !isSelected && isFull;

                return (
                  <div key={docId} className="flex items-center gap-2 w-full">
                    <button
                      onClick={() => !isDisabled && docId && toggleDoc(docId, docName)}
                      className={`flex items-center justify-between gap-2 text-left flex-1 min-w-0 ${
                        isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#767676] shrink-0" />
                        <span className="text-sm text-[#1A1A1A] truncate">{docName}</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-[#215FFF] border-[#215FFF]' : 'border-[#D1D1D1] bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                    {thumbnail && (
                      <button
                        onClick={() => setPreviewThumbnail(thumbnail)}
                        className="shrink-0 cursor-pointer hover:opacity-70 transition-opacity"
                      >
                        <Eye className="w-4 h-4 text-[#767676]" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={handleConfirm}
          disabled={!selectedDocId || selectedDocId === alreadyAttachedId}
          className="w-full py-1.5 px-2 rounded-lg bg-[#215FFF] text-sm font-medium text-white cursor-pointer hover:bg-[#215FFF]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Attach file to session
        </button>
        <span className="text-xs text-[#767676]">
          You can attach upto {MAX_ATTACHMENTS} documents
        </span>
      </div>

      {/* Thumbnail preview overlay */}
      {previewThumbnail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setPreviewThumbnail(null)}
        >
          <div
            className="relative bg-white rounded-lg p-2 max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewThumbnail(null)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow flex items-center justify-center cursor-pointer hover:opacity-80"
            >
              <X className="w-4 h-4 text-[#767676]" />
            </button>
            <img
              src={previewThumbnail}
              alt="Document preview"
              className="max-w-[400px] max-h-[70vh] object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AddAttachmentsDialog;
