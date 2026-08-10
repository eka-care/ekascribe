'use client';

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@ui/src';
import ButtonWrapper from '@/shared-components/button/button-wrapper';
import { CheckCircle2, ChevronLeft, ChevronRight, Upload, X } from 'lucide-react';
import WarningAlert from '@/shared-components/alert/warning-alert';
import useVoice2RxStore from '@/store/store';
import { tracker } from '@/analytics';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { useProcessTranscript } from '../../hooks/recording/use-process-transcript';
import { useProcessAudio } from '../../hooks/recording/use-process-audio';

type TStep = 'transcript' | 'voice';

const AUDIO_ALLOWED_TYPES = [
  'audio/mp3',
  'audio/ogg',
  'audio/m4a',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'video/mp4',
  'audio/x-m4a',
];
const AUDIO_ALLOWED_EXTENSIONS = ['.mp3', '.mp4', '.m4a', '.wav', '.ogg'];
const AUDIO_ACCEPT = '.mp3,.mp4,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav,video/mp4';

interface TertiarySessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep?: 'voice' | 'transcript';
  sessionId: string;
}

export function TertiarySessionDialog({
  open,
  onOpenChange,
  initialStep = 'voice',
  sessionId,
}: TertiarySessionDialogProps) {
  const [step, setStep] = useState<TStep>(initialStep);

  // Sync step when dialog opens with a specific initialStep
  useEffect(() => {
    if (open) setStep(initialStep);
  }, [open, initialStep]);

  const [audioFileError, setAudioFileError] = useState<string | null>(null);
  const warningScreen = useVoice2RxStore((state) => state.warningScreen);
  const clearWarningInfo = useVoice2RxStore((state) => state.clearWarningInfo);

  const {
    transcriptionText,
    setTranscriptionText,
    isLoading: isUploadTxnLoading,
    processTranscript,
  } = useProcessTranscript(sessionId);

  const {
    audioFile,
    setAudioFile,
    isLoading: isUploadAudioLoading,
    processAudio,
  } = useProcessAudio();

  const audioFileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    clearWarningInfo();
    onOpenChange(false);
    setTimeout(() => {
      setAudioFileError(null);
    }, 200);
  };

  const handleBack = () => handleClose();

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    validateAndSetAudioFile(file);
  };

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    validateAndSetAudioFile(e.dataTransfer.files?.[0] ?? null);
  };

  const validateAndSetAudioFile = (file: File | null) => {
    setAudioFileError(null);
    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const isAllowed =
      AUDIO_ALLOWED_TYPES.includes(file.type) || AUDIO_ALLOWED_EXTENSIONS.includes(extension);
    if (!isAllowed) {
      setAudioFileError('Invalid file type. Supported: MP3, MP4, M4A, WAV.');
      return;
    }
    setAudioFile(file);
  };

  const handleGenerateNotes = async () => {
    clearWarningInfo();
    try {
      let success = false;
      if (step === 'transcript') {
        success = await processTranscript();
      } else if (step === 'voice') {
        tracker.track({
          name: MIXPANEL_EVENT_NAME.SCRIBEWEB_NEW_SESSION,
          type: MIXPANEL_EVENT_TYPE.UPLOAD_RECORDING,
        });
        success = await processAudio();
      }
      if (success) {
        handleClose();
      }
    } catch (error) {
      console.error('handleGenerateNotes failed:', error);
    }
  };

  const isGenerateDisabled =
    step === 'transcript' ? !transcriptionText.trim() : step === 'voice' ? !audioFile : false;

  const isGenerateLoading = step === 'transcript' ? isUploadTxnLoading : isUploadAudioLoading;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-[560px] border-border p-0 gap-0 overflow-hidden rounded-lg"
        showCloseButton
      >
        {/* {step === 'choose' && (
          <ChooseStep
            choice={choice}
            setChoice={setChoice}
            onNext={handleNext}
            onBack={handleClose}
          />
        )} */}

        {step === 'transcript' && (
          <TranscriptStep
            transcriptionText={transcriptionText}
            setTranscriptionText={setTranscriptionText}
            onBack={handleBack}
            onGenerate={handleGenerateNotes}
            isGenerateDisabled={isGenerateDisabled}
            isGenerateLoading={isGenerateLoading}
            showWarning={warningScreen === 'upload_transcription'}
          />
        )}

        {step === 'voice' && (
          <VoiceStep
            audioFile={audioFile}
            onFileInputRef={audioFileInputRef}
            onFileChange={handleAudioFileChange}
            onFileDrop={handleAudioDrop}
            onRemoveFile={() => setAudioFile(null)}
            fileError={audioFileError}
            onBack={handleBack}
            onGenerate={handleGenerateNotes}
            isGenerateDisabled={isGenerateDisabled}
            isGenerateLoading={isGenerateLoading}
            showWarning={warningScreen === 'upload_audio'}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Transcript Step ─────────────────────────────────────────────────────────

function TranscriptStep({
  transcriptionText,
  setTranscriptionText,
  onBack,
  onGenerate,
  isGenerateDisabled,
  isGenerateLoading,
  showWarning,
}: {
  transcriptionText: string;
  setTranscriptionText: (v: string) => void;
  onBack: () => void;
  onGenerate: () => void;
  isGenerateDisabled: boolean;
  isGenerateLoading: boolean;
  showWarning: boolean;
}) {
  return (
    <div className="flex flex-col px-6 py-6 space-y-6">
      <DialogHeader className="gap-1">
        <DialogTitle className="text-xl text-center font-semibold">Add transcript</DialogTitle>
        <DialogDescription className="text-sm text-center text-muted-foreground">
          Paste your consultation transcript below.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-6 border-t border-[#D1D1D1]" />

      <div className="flex flex-col gap-4">
        <textarea
          className="w-full h-36 bg-neutral-50 border border-border rounded-lg p-3 text-sm text-foreground resize-none outline-none placeholder:text-muted-foreground focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Paste the transcript here..."
          value={transcriptionText}
          onChange={(e) => setTranscriptionText(e.target.value)}
          autoFocus
          disabled={isGenerateLoading}
        />
      </div>

      {showWarning && <WarningAlert />}

      <div className="-mx-6 border-t border-[#D1D1D1]" />

      <div className="flex gap-3">
        <ButtonWrapper variant="outline" onClick={onBack} className="flex-1 gap-1">
          <ChevronLeft className="w-4 h-4" />
          Back
        </ButtonWrapper>
        <ButtonWrapper
          variant="default"
          onClick={onGenerate}
          disabled={isGenerateDisabled}
          isLoading={isGenerateLoading}
          className="flex-1 gap-1.5"
        >
          Generate notes
          <ChevronRight className="w-4 h-4" />
        </ButtonWrapper>
      </div>
    </div>
  );
}

// ─── Voice Step ──────────────────────────────────────────────────────────────

function VoiceStep({
  audioFile,
  onFileInputRef,
  onFileChange,
  onFileDrop,
  onRemoveFile,
  fileError,
  onBack,
  onGenerate,
  isGenerateDisabled,
  isGenerateLoading,
  showWarning,
}: {
  audioFile: File | null;
  onFileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: React.DragEvent) => void;
  onRemoveFile: () => void;
  fileError: string | null;
  onBack: () => void;
  onGenerate: () => void;
  isGenerateDisabled: boolean;
  isGenerateLoading: boolean;
  showWarning: boolean;
}) {
  return (
    <div className="flex flex-col px-6 py-6 space-y-6">
      <DialogHeader className="gap-1">
        <DialogTitle className="text-xl text-center font-semibold">
          Upload voice recording
        </DialogTitle>
        <DialogDescription className="text-sm text-center text-muted-foreground">
          Upload an audio file from a previous consultation.
        </DialogDescription>
      </DialogHeader>

      <div className="-mx-6 border-t border-[#D1D1D1]" />

      <div className="flex flex-col gap-4">
        <input
          ref={onFileInputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          className="hidden"
          onChange={onFileChange}
        />

        {audioFile ? (
          <div
            className={`relative border border-primary/30 bg-primary/5 rounded-lg p-4 flex flex-col items-center gap-2 ${
              isGenerateLoading ? 'opacity-50' : ''
            }`}
          >
            <button
              onClick={onRemoveFile}
              disabled={isGenerateLoading}
              className="absolute top-2 right-2 p-0.5 rounded-full hover:bg-accent transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <CheckCircle2 className="w-8 h-8 text-green-500 fill-green-100" />
            <p className="text-sm font-medium text-foreground">{audioFile.name}</p>
            <p className="text-xs text-muted-foreground">File uploaded successfully.</p>
          </div>
        ) : (
          <div
            className={`border border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-2 transition-all ${
              isGenerateLoading
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer hover:border-primary/40 hover:bg-neutral-50'
            }`}
            onClick={() => !isGenerateLoading && onFileInputRef.current?.click()}
            onDrop={(e) => !isGenerateLoading && onFileDrop(e)}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground">.mp3, .m4a, .wav</p>
          </div>
        )}

        {fileError && <p className="text-xs text-destructive">{fileError}</p>}
      </div>

      {showWarning && <WarningAlert />}

      <div className="-mx-6 border-t border-[#D1D1D1]" />

      <div className="flex gap-3">
        <ButtonWrapper variant="outline" onClick={onBack} className="flex-1 gap-1">
          <ChevronLeft className="w-4 h-4" />
          Back
        </ButtonWrapper>
        <ButtonWrapper
          variant="default"
          onClick={onGenerate}
          disabled={isGenerateDisabled}
          isLoading={isGenerateLoading}
          className="flex-1 gap-1.5"
        >
          Generate notes
          <ChevronRight className="w-4 h-4" />
        </ButtonWrapper>
      </div>
    </div>
  );
}
