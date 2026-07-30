'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, Upload, ImageIcon, FolderClosed, File } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Label } from '@ui/src';
import TextSeparator from '@/shared-components/text-separator';
import WarningAlert from '@/shared-components/alert/warning-alert';
import useVoice2RxStore from '@/store/store';
import ButtonWrapper from '@/shared-components/button/button-wrapper';
import { getSDK } from '@/features/session/services/sdk-provider';
import { with401Retry } from '@/fetch-client/api-with-retry';

interface SelectedFile {
  file: File;
  id: string;
}

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const SUPPORTED_EXTENSIONS: string[] = ['.jpg', '.jpeg', '.pdf', '.txt', '.md', '.csv', '.json'];

const ACCEPTED_FILE_TYPES = SUPPORTED_EXTENSIONS.join(',');

const AiGenerateTemplateDialog = ({ open, onOpenChange }: UploadDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [textContent, setTextContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setWarningInfo = useVoice2RxStore((state) => state.setWarningInfo);
  const clearWarningInfo = useVoice2RxStore((state) => state.clearWarningInfo);
  const setTemplateData = useVoice2RxStore((state) => state.setTemplateData);
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const warningScreen = useVoice2RxStore((state) => state.warningScreen);

  const supportedFormats = 'JPG, JPEG, PDF, ".txt", ".md", ".csv", ".json" (Max 2MB)';

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const validateFile = (file: File) => {
    const dotIndex = file.name.lastIndexOf('.');
    const extension = dotIndex === -1 ? '' : file.name.slice(dotIndex).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setWarningInfo({
        screen: 'template',
        message: `File type not supported: ${file.name}`,
      });
      return null;
    }

    if (file.size > MAX_FILE_SIZE) {
      setWarningInfo({
        screen: 'template',
        message: 'File size exceeds 2MB limit',
      });
      return null;
    }

    return {
      file,
      id: Math.random().toString(36).substring(2, 9),
    };
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    handleCancel();
  };

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Clear any stale warning from a previous attempt before validating again
    clearWarningInfo();

    // Only take the first file since we only allow single file selection
    const file = files[0];
    const validFile = validateFile(file);

    if (validFile) {
      setSelectedFile(validFile);
    }
  }, []);

  const removeFile = () => {
    setSelectedFile(null);
    clearWarningInfo();
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="h-6 w-6 text-primary" />;
    }
    return <File className="h-6 w-6 text-primary" />;
  };

  const handleSubmit = async () => {
    clearWarningInfo();

    if (!selectedFile && !textContent.trim()) {
      setWarningInfo({
        screen: 'template',
        message: 'Please select a file or enter text content',
      });
      return;
    }

    try {
      setIsProcessing(true);

      const response = await with401Retry(
        () =>
          getSDK().documents.aiGenerateTemplate({
            file: selectedFile?.file,
            instruction: textContent.trim(),
          }),
        'ai generate template'
      );

      if (response.status_code >= 400) {
        setWarningInfo({
          screen: 'template',
          message: 'Something went wrong. Please try again.',
        });
        return;
      }

      setSelectedFile(null);
      setTextContent('');
      clearWarningInfo();
      onOpenChange(false);

      setTemplateData({
        title: response.title,
        desc: response.template_instructions,
      });

      router.push('/template/edit?type=raw-template');
    } catch (err) {
      setWarningInfo({
        screen: 'template',
        message: 'Upload failed. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setTextContent('');
    clearWarningInfo();
    onOpenChange(false);
  };

  const hasFile = selectedFile !== null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[calc(100%-2rem)] sm:w-full max-w-md sm:max-w-lg border-border mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Upload or Paste Template</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 min-w-0">
            <Card
              className="w-full border-border border-dashed stroke-4 bg-input shadow-none"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFileSelect(e.dataTransfer.files);
              }}
            >
              <CardContent className="space-y-1.5 text-muted-foreground text-center p-4 sm:p-6">
                <Upload className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
                <p className="font-500 text-sm sm:text-base">
                  Click or drag a file to this area to upload
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBrowseFiles}
                  className="bg-transparent text-primary border-0 shadow-none cursor-pointer text-sm"
                >
                  <FolderClosed className="w-4 h-4" /> Browse Files...
                </Button>
                <p className="text-xs sm:text-sm wrap-break-word">Supported: {supportedFormats}</p>

                {hasFile && selectedFile && (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2 rounded-md border border-border bg-card">
                      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
                        {getFileIcon(selectedFile.file)}
                        <div className="text-left min-w-0 flex-1">
                          <p className="text-xs sm:text-sm text-foreground truncate">
                            {selectedFile.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(selectedFile.file.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={removeFile}
                        className="px-0 hover:bg-transparent cursor-pointer shrink-0"
                      >
                        <X className="h-5 w-5 sm:h-6 sm:w-6" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {!hasFile && (
              <>
                <TextSeparator title="or continue with" />

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Paste Text Content</Label>
                  <Textarea
                    placeholder="Paste your template content here..."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    className="min-h-24 sm:min-h-30 max-h-32 sm:max-h-40 resize-none border-border break-word text-sm"
                    maxLength={5000}
                  />
                </div>
              </>
            )}

            {warningScreen === 'template' && <WarningAlert />}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:space-x-2 pt-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="border-border cursor-pointer w-full sm:w-auto"
              >
                Cancel
              </Button>
              <ButtonWrapper
                onClick={handleSubmit}
                className="cursor-pointer w-full sm:w-auto"
                isLoading={isProcessing}
                disabled={!textContent.trim() && !hasFile}
              >
                Process Template
              </ButtonWrapper>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
        accept={ACCEPTED_FILE_TYPES}
      />
    </>
  );
};

export default AiGenerateTemplateDialog;
