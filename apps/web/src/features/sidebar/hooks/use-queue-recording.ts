'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import useVoice2RxStore from '@/store/store';
import { getSDK } from '@/features/session/services/sdk-provider';
import { useSessionLifecycle } from '@/features/session/hooks/use-session-lifecycle';
import { useMicrophonePermission } from '@/features/session/hooks/use-microphone-permission';
import { getBlobStore } from '@/platform';
import { getFirestoreDB } from '../../../lib/firebase';
import { TQueueAppointment } from './use-queue-appointments';
import { TPatientInfo } from '@/features/patient/hooks/use-patient-bulk-info';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { SESSION_PHASE } from '@/constants/enums';

type TQueueItem = TQueueAppointment & {
  patientInfo?: TPatientInfo;
};

export const useQueueRecording = () => {
  const router = useRouter();
  const { createSession, startRecording } = useSessionLifecycle();
  const { checkMicrophonePermission } = useMicrophonePermission({
    screen_name: 'start_session',
  });
  const isStartingRef = useRef(false);

  const clearStore = useVoice2RxStore((state) => state.clearStore);
  const clearRecordingSessionId = useVoice2RxStore((state) => state.clearRecordingSessionId);
  const setSidebarActiveTab = useVoice2RxStore((state) => state.setSidebarActiveTab);
  const setQueueRecordingPatientOid = useVoice2RxStore(
    (state) => state.setQueueRecordingPatientOid
  );

  const startQueueRecording = useCallback(
    async (item: TQueueItem) => {
      const store = useVoice2RxStore.getState();

      // Guard: any session busy (V2 phases)
      const recId = store.sessionV2Ongoing.recording_session_id;
      const phase = recId ? store.sessionV2ContentById[recId]?.phase : undefined;
      const isSessionBusy =
        phase === SESSION_PHASE.RECORDING ||
        phase === SESSION_PHASE.PAUSED ||
        phase === SESSION_PHASE.PROCESSING;
      if (isSessionBusy || store.queueRecordingPatientOid) return;

      // Guard: debounce rapid clicks
      if (isStartingRef.current) return;
      isStartingRef.current = true;

      try {
        // Check mic permission first
        const micPermission = await checkMicrophonePermission();
        if (!micPermission) {
          isStartingRef.current = false;
          return;
        }

        // Set queue recording patient before clearStore (clearStore preserves it)
        setQueueRecordingPatientOid(item.patient_oid);

        // Clear previous session state
        clearStore();
        clearRecordingSessionId();
        setSidebarActiveTab('my_queue');

        // Build patient details for createSession
        const queuePatient = item.patientInfo
          ? {
              oid: item.patient_oid,
              username: item.patientInfo.fullName || item.patientInfo.firstName,
              age: item.patientInfo.age,
              biologicalSex: item.patientInfo.gender,
            }
          : null;

        // Clean up blob store in background
        (async () => {
          try {
            await getBlobStore().delete('', undefined);
          } catch {
            // best-effort
          }
        })();

        // Create V2 session with encounter_id and patient details
        const sessionID = await createSession({
          encounter_id: item.encounter_id,
          patient_details: queuePatient,
        });

        if (!sessionID) {
          setQueueRecordingPatientOid(null);
          isStartingRef.current = false;
          return;
        }

        // Start recording via V2 lifecycle
        await startRecording(sessionID);

        // Navigate to session page
        router.push('/new-session');
      } catch (error) {
        console.error('Queue recording failed:', error);
        setQueueRecordingPatientOid(null);
      } finally {
        isStartingRef.current = false;
      }
    },
    [
      checkMicrophonePermission,
      clearStore,
      clearRecordingSessionId,
      setSidebarActiveTab,
      setQueueRecordingPatientOid,
      createSession,
      startRecording,
      router,
    ]
  );

  const endVisit = useCallback(
    async (appointmentId: string, patientOid: string) => {
      const store = useVoice2RxStore.getState();

      // If recording is active for this patient, stop it first
      if (store.queueRecordingPatientOid === patientOid) {
        const recId = store.sessionV2Ongoing.recording_session_id;
        const phase = recId ? store.sessionV2ContentById[recId]?.phase : undefined;
        const isRecording = phase === SESSION_PHASE.RECORDING || phase === SESSION_PHASE.PAUSED;

        if (isRecording) {
          try {
            await with401Retry(() => getSDK().endRecording(), 'end recording');
          } catch (error) {
            console.error('Failed to stop recording during end visit:', error);
          }
        }

        setQueueRecordingPatientOid(null);
      }

      // Update Firebase appointment status
      try {
        const db = getFirestoreDB();
        await updateDoc(doc(db, 'appointments', appointmentId), {
          status: 'CMNP',
        });
      } catch (error) {
        console.error('Failed to update appointment status:', error);
      }
    },
    [setQueueRecordingPatientOid]
  );

  return { startQueueRecording, endVisit };
};
