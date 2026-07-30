'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Square,
  SquarePen,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import WaveformIcon from '@/assets/waveform-icon';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/src';
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import useVoice2RxStore from '@/store/store';
import { SESSION_PHASE } from '@/constants/enums';
import { getSessionErrorContent } from './output/error-component';
import { resolveOutputTemplates } from '../utils/resolve-output-templates';
import { AudioWaveformTimer } from './recording/audio-waveform-timer';
import AudioQualitySummary from './recording/audio-quality-summary';
import DownloadAudioButton from '@/features/session/components/recording/download-audio-button';
import { useSessionLifecycle } from '../hooks/use-session-lifecycle';
import { useSessionLimitGuard } from '../hooks/use-session-limit-guard';
import { PatientDirectoryComponent } from '@/features/patient/components/patient-directory-component';

interface SessionHeaderProps {
  sessionId: string;
  isPastSession?: boolean;
  onEditPreferences?: () => void;
  onAddTranscriptOrVoice: () => void;
  isAnotherSessionActive?: boolean;
  isLimitExceeded?: boolean;
  onShowLimitDialog?: () => void;
  microphoneSelector?: React.ReactNode;
}

const SessionHeader = ({
  sessionId,
  isPastSession,
  onEditPreferences,
  onAddTranscriptOrVoice,
  isAnotherSessionActive,
  isLimitExceeded,
  onShowLimitDialog,
  microphoneSelector,
}: SessionHeaderProps) => {
  const limitGuard = useSessionLimitGuard({
    isLimitExceeded: !!isLimitExceeded,
    onShowLimitDialog,
  });

  // Read from store
  const phase = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.phase || SESSION_PHASE.IDLE
  );
  const sessionConfig = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.session_config);
  const templateNameById = useVoice2RxStore((s) => s.templateNameById);
  const userStatus = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.user_status || '');
  const userDefaultTemplates = useVoice2RxStore(
    (s) => s.userLevelPreferences.output_format_template
  );
  const uiLoading = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.loading || false
  );
  const sessionError = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.error ?? null);

  // Lifecycle handlers from hook
  const {
    startRecording,
    pauseRecording,
    resumeRecording,
    endRecording,
    discardSession,
    stopProcessing,
    isStartSessionLoading,
  } = useSessionLifecycle();

  const [isRecordingDropdownOpen, setIsRecordingDropdownOpen] = useState(false);

  const isOutput = phase === SESSION_PHASE.OUTPUT;

  const inputLanguagesText = useMemo(() => {
    const langs = sessionConfig?.input_languages;
    return langs?.length ? langs.map((l) => l.name).join(', ') : '';
  }, [sessionConfig]);

  const outputFormatText = useMemo(() => {
    const templates = sessionConfig?.output_format_template;
    if (!templates?.length) return '';
    return templates
      .map((t) => templateNameById[t.id] || t.name)
      .filter(Boolean)
      .join(', ');
  }, [sessionConfig, templateNameById]);

  const consultationModeText = sessionConfig?.consultation_mode || '';
  const modelTypeText = sessionConfig?.model_type || '';

  const showEditButton = phase === SESSION_PHASE.IDLE && !uiLoading;

  const handleAnotherSessionActiveClick = () => {
    useVoice2RxStore.getState().setWarningInfo({
      screen: 'recording',
      message: 'Another recording session is active. Please end it before starting a new one.',
    });
  };

  const handleStartRecordingClick = () => {
    if (limitGuard.isLimitExceeded) {
      limitGuard.showLimitDialog();
      return;
    }
    if (isAnotherSessionActive) {
      handleAnotherSessionActiveClick?.();
      return;
    }
    startRecording(sessionId);
  };

  const isNotStarted = phase === SESSION_PHASE.IDLE;
  const isRecording = phase === SESSION_PHASE.RECORDING || phase === SESSION_PHASE.PAUSED;
  const isPaused = phase === SESSION_PHASE.PAUSED;
  const isProcessing = phase === SESSION_PHASE.PROCESSING;

  const settingsItems = useMemo(
    () =>
      [inputLanguagesText, outputFormatText, modelTypeText, consultationModeText].filter(Boolean),
    [inputLanguagesText, outputFormatText, modelTypeText, consultationModeText]
  );

  // Init session with no output format: hint the fallback template.
  const pendingOutputTemplateName = useMemo(() => {
    if (sessionConfig?.output_format_template?.length || userStatus !== 'init') return '';

    const [template] = resolveOutputTemplates(undefined, userDefaultTemplates);

    return template ? templateNameById[template.id] || template.name : '';
  }, [sessionConfig?.output_format_template, userStatus, userDefaultTemplates, templateNameById]);

  const showSessionError = phase === SESSION_PHASE.ERROR && !!sessionError;
  const sessionErrorContent = sessionError ? getSessionErrorContent(sessionError) : null;

  const headerErrorLabel = showSessionError ? sessionErrorContent?.title : null;
  const headerErrorMessage = showSessionError ? sessionErrorContent?.description : null;

  const renderPatientSection = () => {
    return (
      <PatientDirectoryComponent
        sessionId={sessionId}
        disabled={phase === SESSION_PHASE.PROCESSING || limitGuard.isLimitExceeded}
        onDisabledClick={limitGuard.disabledClickHandler}
      />
    );
  };

  return (
    <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[1fr_auto] items-start gap-2 w-full p-4">
      {/* 1. Patient details — full width on mobile, col 1 on desktop */}
      <div className="col-span-2 sm:col-span-1 w-full sm:w-auto min-w-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">{renderPatientSection()}</div>
        {isOutput && (
          <div className="sm:hidden shrink-0">
            <DownloadAudioButton sessionID={sessionId} />
          </div>
        )}
      </div>

      {/* 2. Recording controls — beside patient on desktop, row 2 col 1 on mobile. */}
      <div
        className={`col-span-2 sm:col-span-1 flex flex-col items-stretch sm:items-end justify-center gap-4 w-full ${
          isNotStarted ? '' : 'sm:row-span-2'
        }`}
      >
        {headerErrorMessage && (
          <div className="flex items-center gap-1.5 self-end">
            <CustomTooltip>
              <CustomTooltipTrigger asChild>
                <div className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                  <TriangleAlert className="w-4 h-4 text-[#D92D20]" />
                </div>
              </CustomTooltipTrigger>
              <CustomTooltipContent>{headerErrorMessage}</CustomTooltipContent>
            </CustomTooltip>
            <span className="text-xs font-medium text-[#D92D20]">{headerErrorLabel}</span>
          </div>
        )}

        {isNotStarted && !uiLoading && (
          <div className="relative w-full sm:w-56">
            <Popover open={isRecordingDropdownOpen} onOpenChange={setIsRecordingDropdownOpen}>
              <div className="flex items-center rounded-lg overflow-hidden w-full">
                <button
                  onClick={handleStartRecordingClick}
                  disabled={isStartSessionLoading}
                  className={`flex items-center justify-center gap-2 px-4 w-full h-10 text-sm font-medium text-white whitespace-nowrap transition-colors ${
                    isPastSession ? 'rounded-lg' : 'rounded-l-lg'
                  } ${
                    isAnotherSessionActive
                      ? 'bg-[#039855]/50 cursor-not-allowed'
                      : 'bg-[#039855] cursor-pointer hover:bg-[#16A34A]/90 disabled:opacity-70'
                  }`}
                >
                  {isStartSessionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <>
                      <WaveformIcon />
                      Start transcribing
                    </>
                  )}
                </button>
                {!isPastSession && (
                  <PopoverTrigger
                    asChild
                    disabled={isAnotherSessionActive || limitGuard.isLimitExceeded}
                  >
                    <button
                      className={`flex items-center justify-center h-10 px-3 border-l border-[rgba(241,245,249,0.4)] transition-colors rounded-r-lg ${
                        isAnotherSessionActive || limitGuard.isLimitExceeded
                          ? 'bg-[#039855]/50 cursor-not-allowed'
                          : 'bg-[#039855] cursor-pointer hover:bg-[#16A34A]/90'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4 text-white" />
                    </button>
                  </PopoverTrigger>
                )}
              </div>

              <PopoverContent
                align="end"
                sideOffset={4}
                className="w-[276px] p-1 border border-[#D1D1D1] rounded-md shadow-md bg-white"
              >
                <button
                  onClick={() => {
                    setIsRecordingDropdownOpen(false);
                    onAddTranscriptOrVoice();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[#1A1A1A] hover:bg-[#F5F5F5] rounded cursor-pointer transition-colors"
                >
                  <span className="flex-1 text-left">Upload voice recording</span>
                  <Upload className="w-4 h-4 shrink-0" />
                </button>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {isRecording && (
          <div className="flex flex-col items-stretch sm:items-end gap-2 w-full">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {isPaused ? (
                <Button
                  size="lg"
                  onClick={resumeRecording}
                  className="flex-1 sm:flex-none sm:w-36 bg-green-10 hover:bg-green-10/90 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Resume
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={pauseRecording}
                  className="flex-1 sm:flex-none sm:w-36 cursor-pointer"
                >
                  <Pause className="w-4 h-4 fill-white" />
                  Pause
                </Button>
              )}

              <Button
                variant="destructive"
                size="lg"
                className="flex-1 sm:flex-none sm:w-40 cursor-pointer"
                onClick={endRecording}
              >
                <Square className="fill-white" />
                End session
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="cursor-pointer shrink-0 p-1.5 rounded-md hover:bg-accent">
                    <MoreVertical className="w-5 h-5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="bottom"
                  align="end"
                  sideOffset={12}
                  className="min-w-[180px] rounded-md border-[#D1D1D1] p-1 shadow-md"
                >
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-sm font-normal text-[#D92D20] focus:text-[#D92D20]"
                    onClick={discardSession}
                  >
                    <Trash2 className="w-4 h-4 text-[#D92D20]" />
                    Discard session
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <AudioWaveformTimer sessionId={sessionId} />
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              disabled
              className="opacity-50 cursor-default border-[#D1D1D1] bg-white text-[#1A1A1A]"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating notes
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="cursor-pointer p-1.5 rounded-md hover:bg-accent">
                  <MoreVertical className="w-5 h-5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                sideOffset={12}
                className="min-w-[180px] rounded-md border-[#D1D1D1] p-1 shadow-md"
              >
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-sm font-normal text-[#D92D20] focus:text-[#D92D20]"
                  onClick={stopProcessing}
                >
                  <Square className="fill-[#D92D20] w-4 h-4" />
                  Stop processing
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {isOutput && (
          <div className="hidden sm:flex flex-col items-end gap-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-end gap-4">
                <DownloadAudioButton sessionID={sessionId} />
              </div>
              <div className="hidden sm:block">
                <AudioQualitySummary sessionId={sessionId} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Settings meta — full width row on mobile, col 1 row 2 on desktop */}
      <div className="col-span-2 sm:col-span-1 flex flex-col space-y-1.5 px-2 min-w-0">
        <div className="flex items-center flex-wrap gap-4">
          <div className="flex items-center flex-wrap gap-2">
            {settingsItems.map((item, index) => (
              <span key={index} className="flex items-center gap-2">
                {index > 0 && <span className="w-1 h-1 rounded-full bg-foreground" />}
                <span className="text-xs text-foreground capitalize">{item}</span>
              </span>
            ))}
          </div>

          {showEditButton && onEditPreferences && (
            <button
              onClick={() => limitGuard.guardAction(() => onEditPreferences())}
              className={`flex items-center gap-1 ${
                limitGuard.isLimitExceeded ? 'cursor-not-allowed' : 'cursor-pointer'
              } hover:opacity-80 transition-opacity`}
            >
              <SquarePen className="w-4 h-4 text-[#215FFF]" />
              <span className="text-xs font-medium">Edit</span>
            </button>
          )}
        </div>

        {pendingOutputTemplateName && (
          <span className="text-xs text-secondary-foreground">
            Output will be generated in {pendingOutputTemplateName}
          </span>
        )}
      </div>

      {/* 4. Microphone — beside Start on mobile (row 2 col 2), under Start on desktop (row 2 col 2) */}
      {isNotStarted && !uiLoading && (
        <div className="col-start-2 row-start-2 min-w-0 sm:col-start-auto sm:row-start-auto sm:w-56">
          {microphoneSelector}
        </div>
      )}
    </div>
  );
};

export default SessionHeader;
