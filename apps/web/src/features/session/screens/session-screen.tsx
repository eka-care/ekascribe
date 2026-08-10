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
import { useRecordingCallbacks } from '../hooks/recording/use-recording-callbacks';
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

  const isLivePhase = (phase?: string) =>
    phase === SESSION_PHASE.RECORDING ||
    phase === SESSION_PHASE.PAUSED ||
    phase === SESSION_PHASE.PROCESSING;

  // On mount: load existing session, or decide what to land on for /new-session.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    sessionId ? initPastSession(sessionId) : initNewSession();
  }, [sessionId, createSession, loadSession, startRecording]);

  function initPastSession(sid: string) {
    const store = useVoice2RxStore.getState();
    const rid = store.sessionV2Ongoing.recording_session_id;
    if (rid && rid !== sid) {
      const ridErr = store.sessionV2ContentById[rid]?.error;
      if (ridErr?.code === 'create_session_failed') {
        store.clearSessionV2Content(rid);
        store.clearRecordingSessionId();
      }
    }

    if (isLivePhase(store.sessionV2ContentById[sid]?.phase)) return;
    loadSession(sid);
  }

  function initNewSession() {
    const store = useVoice2RxStore.getState();
    const persistedId = store.sessionV2Ongoing.recording_session_id;

    const maybeAutoStart = (newId: string | null) => {
      const { autoStartRecording, setAutoStartRecording } = useVoice2RxStore.getState();
      if (autoStartRecording && newId) {
        setAutoStartRecording(false);
        startRecording(newId);
      }
    };

    if (!persistedId) {
      createSession().then(maybeAutoStart);
      return;
    }

    const content = store.sessionV2ContentById[persistedId];
    if (isLivePhase(content?.phase)) return;
    if (content?.error?.code === 'create_session_failed') return;

    loadSession(persistedId).then((found) => {
      if (!found) createSession({ force: true });
    });
  }

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
