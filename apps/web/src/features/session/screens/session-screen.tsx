'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useVoice2RxStore from '@/store/store';
import { MicrophoneSelectorComponent } from '@/features/session/components/recording/microphone-selector-container';
import { tracker } from '@/analytics';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import SessionHeader from '../components/session-header';
import SessionBody from '../components/session-body';
import { EditPreferencesDialog } from '../components/dialogs/edit-preferences-dialog';
import { TertiarySessionDialog } from '../components/dialogs/tertiary-session-dialog';
import SessionLimitDialog from '../components/dialogs/session-limit-dialog';
import { CreateSessionErrorDialog } from '../components/dialogs/create-session-error-dialog';
import { SESSION_PHASE } from '@/constants/enums';
import { useSessionLifecycle } from '../hooks/use-session-lifecycle';
import { useBeforeUnload } from '../hooks/use-before-unload';
import { useRecordingCallbacks } from '../hooks/use-recording-callbacks';
import { fetchLatestSessionId } from '../services/session-loader';

interface SessionScreenProps {
  sessionId?: string;
}

const SessionScreen = ({ sessionId }: SessionScreenProps) => {
  const router = useRouter();
  const { createSession, loadSession, startRecording } = useSessionLifecycle();
  useBeforeUnload();

  useEffect(() => {
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_HOME,
    });
  }, []);

  const recordingSessionId = useVoice2RxStore((s) => s.sessionV2Ongoing.recording_session_id);
  const recordingPhase = useVoice2RxStore(
    (s) => s.sessionV2ContentById[s.sessionV2Ongoing.recording_session_id]?.phase
  );
  const isLimitExceeded = useVoice2RxStore(
    (s) =>
      s.sessionV2ContentById[s.sessionV2Ongoing.recording_session_id]?.is_limit_exceeded ?? false
  );
  const createSessionError = useVoice2RxStore((s) => {
    const err = s.sessionV2ContentById[s.sessionV2Ongoing.recording_session_id]?.error;
    return err?.code === 'create_session_failed' ? err : null;
  });

  // Only relevant for the new session screen — past sessions should never show the limit modal
  const showLimitExceeded = !sessionId && isLimitExceeded;
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);
  const showCreateErrorDialog = !sessionId && !!createSessionError && !isErrorDismissed;

  // Show the limit dialog when is_limit_exceeded flips to true
  useEffect(() => {
    if (showLimitExceeded) setIsLimitDialogOpen(true);
  }, [showLimitExceeded]);

  // Register SDK callbacks when recording is active
  const { register, unregister } = useRecordingCallbacks();
  const isRecordingActive =
    recordingPhase === SESSION_PHASE.RECORDING || recordingPhase === SESSION_PHASE.PAUSED;

  useEffect(() => {
    if (isRecordingActive) {
      register();
      return () => unregister();
    }
  }, [isRecordingActive, register, unregister]);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [tertiaryDialogMode, setTertiaryDialogMode] = useState<'voice' | 'transcript' | null>(null);

  const initRef = useRef(false);

  // On mount: load existing session, or decide what to land on for /new-session.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const maybeAutoStart = (newSessionId: string | null) => {
      const { autoStartRecording, setAutoStartRecording } = useVoice2RxStore.getState();
      if (autoStartRecording && newSessionId) {
        setAutoStartRecording(false);
        startRecording(newSessionId);
      }
    };

    const isLivePhase = (phase?: string) =>
      phase === SESSION_PHASE.RECORDING ||
      phase === SESSION_PHASE.PAUSED ||
      phase === SESSION_PHASE.PROCESSING;

    if (sessionId) {
      // Clean up stale create-error from a previous new-session attempt
      const rid = useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id;
      if (rid && rid !== sessionId) {
        const ridErr = useVoice2RxStore.getState().sessionV2ContentById[rid]?.error;
        if (ridErr?.code === 'create_session_failed') {
          useVoice2RxStore.getState().clearSessionV2Content(rid);
          useVoice2RxStore.getState().clearRecordingSessionId();
        }
      }

      const phase = useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.phase;
      if (isLivePhase(phase)) return;

      loadSession(sessionId);
      return;
    }

    // guard check in New Session Entry gate
    const persistedSessionId = useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id;

    if (!persistedSessionId) {
      createSession().then(maybeAutoStart);
      return;
    }

    const persistedContent = useVoice2RxStore.getState().sessionV2ContentById[persistedSessionId];
    if (isLivePhase(persistedContent?.phase)) return;

    // Session creation already failed — don't re-validate or create again.
    if (persistedContent?.error?.code === 'create_session_failed') return;

    // Validate the persisted pointer; if the session never reached the backend, create fresh.
    loadSession(persistedSessionId).then((found) => {
      if (!found) {
        createSession({ force: true });
      }
    });
  }, [sessionId, createSession, loadSession, startRecording]);

  // Check if another session is actively recording (relevant when viewing a past session)
  const isAnotherSessionActive = useMemo(() => {
    if (!sessionId) return false;
    return (
      (recordingPhase === SESSION_PHASE.RECORDING || recordingPhase === SESSION_PHASE.PAUSED) &&
      recordingSessionId !== '' &&
      recordingSessionId !== sessionId
    );
  }, [sessionId, recordingPhase, recordingSessionId]);

  // Dismiss create-error modal: close immediately, then redirect to last history session
  const handleDismissCreateError = useCallback(
    (open: boolean) => {
      if (open) return;
      setIsErrorDismissed(true);
      fetchLatestSessionId().then((latestId) => {
        if (latestId) router.replace(`/session/${latestId}`);
      });
    },
    [router]
  );

  const resolvedSessionId = sessionId || recordingSessionId;

  return (
    <div className="relative h-full w-full">
      <div className="flex flex-col h-full w-full bg-[#F5F8FF]">
        <SessionHeader
          sessionId={resolvedSessionId || ''}
          isPastSession={!!sessionId}
          onEditPreferences={() => setIsEditDialogOpen(true)}
          onAddTranscriptOrVoice={() => {
            setTertiaryDialogMode('voice');
            tracker.track({
              name: MIXPANEL_EVENT_NAME.SCRIBEWEB_HOME_CLICKS,
              type: MIXPANEL_EVENT_TYPE.ADD_TRANSCRIPT,
            });
          }}
          isAnotherSessionActive={isAnotherSessionActive}
          isLimitExceeded={showLimitExceeded}
          onShowLimitDialog={() => setIsLimitDialogOpen(true)}
          microphoneSelector={<MicrophoneSelectorComponent isMicrophoneSelectorEnabled={true} />}
        />

        {resolvedSessionId && (
          <SessionBody
            sessionId={resolvedSessionId}
            onAddTranscript={() => setTertiaryDialogMode('transcript')}
            isLimitExceeded={showLimitExceeded}
          />
        )}

        <EditPreferencesDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          sessionID={resolvedSessionId || ''}
        />
        <TertiarySessionDialog
          open={tertiaryDialogMode !== null}
          onOpenChange={(open) => {
            if (!open) setTertiaryDialogMode(null);
          }}
          initialStep={tertiaryDialogMode || 'voice'}
          sessionId={resolvedSessionId || ''}
        />
        <SessionLimitDialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen} />
        <CreateSessionErrorDialog
          open={showCreateErrorDialog}
          onOpenChange={handleDismissCreateError}
          message={createSessionError?.message || ''}
          code={createSessionError?.api_code}
          onStartNewSession={() => {
            if (recordingSessionId)
              useVoice2RxStore.getState().clearSessionV2Content(recordingSessionId);
            useVoice2RxStore.getState().clearRecordingSessionId();
          }}
          onEditSettings={() => {
            setIsErrorDismissed(true);
            router.replace(`${window.location.pathname}?modal=user-defaults` as never);
          }}
        />
      </div>
    </div>
  );
};

export default SessionScreen;
