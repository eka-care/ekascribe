'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TPastSessionHistoryData } from '@/constants/types';
import { with401Retry } from '@/fetch-client/api-with-retry';
import useVoice2RxStore from '@/store/store';
import * as sdkService from '../services/sdk-service';

export function useSessionContext({
  sessionId,
  patientOid,
}: {
  sessionId: string;
  patientOid?: string;
}) {
  const [linkedSessions, setLinkedSessions] = useState<TPastSessionHistoryData[]>([]);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [patientSessions, setPatientSessions] = useState<TPastSessionHistoryData[]>([]);
  const [loadingPatientSessions, setLoadingPatientSessions] = useState(false);

  // Subscribe reactively so the effect re-runs when loadSessionDetails populates session_context
  const storeSessionContext = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.session_context
  );

  // Restore linked sessions from V2 store session_context.
  // API returns: { past_sessions: [{ session_id, date_epoch }] }
  // Skip effect when we ourselves wrote to the store (via syncToStore) to avoid loops.
  const isLocalWriteRef = useRef(false);

  useEffect(() => {
    if (!storeSessionContext) return;

    // Skip if this update came from our own syncToStore call
    if (isLocalWriteRef.current) {
      isLocalWriteRef.current = false;
      return;
    }

    const sessions = storeSessionContext.past_sessions ?? [];

    setLinkedSessions(
      sessions.map((s) => ({
        txn_id: s.session_id,
        created_at: s.date_epoch ? new Date(s.date_epoch * 1000).toISOString() : '',
        b_id: '',
        user_status: '',
        processing_status: '',
        mode: '',
        uuid: '',
        oid: '',
      }))
    );
  }, [storeSessionContext]);

  // Sync local state back to store so context survives navigation
  const syncToStore = useCallback(
    (sessions: TPastSessionHistoryData[]) => {
      isLocalWriteRef.current = true;
      useVoice2RxStore.getState().setSessionV2Content(sessionId, {
        session_context: {
          past_sessions: sessions.map((s) => ({
            session_id: s.txn_id,
            date_epoch: s.created_at ? Math.floor(new Date(s.created_at).getTime() / 1000) : 0,
          })),
        },
      });
    },
    [sessionId]
  );

  const isPatientSelected = !!patientOid;

  const handleOpenLinkDialog = useCallback(async () => {
    if (!patientOid) return;
    setShowLinkDialog(true);
    setLoadingPatientSessions(true);

    try {
      const response = await with401Retry(
        () =>
          sdkService.getSessionHistory({
            txn_count: 10,
            oid: patientOid,
          }),
        'get patient session history'
      );
      if (response.status_code === 200 && response.data) {
        setPatientSessions(response.data.filter((s) => s.txn_id !== sessionId));
      }
    } catch {
      setPatientSessions([]);
    } finally {
      setLoadingPatientSessions(false);
    }
  }, [patientOid, sessionId]);

  const handleAddLinkedSessions = useCallback(
    async (sessions: TPastSessionHistoryData[]) => {
      const updated = [...linkedSessions, ...sessions];
      setLinkedSessions(updated);
      setShowLinkDialog(false);
      syncToStore(updated);

      if (sessionId && sessions.length > 0) {
        try {
          await with401Retry(
            () =>
              sdkService.addSessionContext({
                txn_id: sessionId,
                context: { past_sessions: sessions.map((s) => s.txn_id) },
              }),
            'add session context'
          );
        } catch {
          useVoice2RxStore.getState().setWarningInfo({
            screen: 'template',
            message: 'Failed to link sessions. Please try again.',
          });
        }
      }
    },
    [sessionId, linkedSessions, syncToStore]
  );

  const handleRemoveLinkedSession = useCallback(
    async (txnId: string) => {
      const updated = linkedSessions.filter((s) => s.txn_id !== txnId);
      setLinkedSessions(updated);
      syncToStore(updated);

      if (sessionId) {
        try {
          await with401Retry(
            () =>
              sdkService.removeSessionContext({
                txn_id: sessionId,
                context: { past_sessions: [txnId] },
              }),
            'remove session context'
          );
        } catch {
          useVoice2RxStore.getState().setWarningInfo({
            screen: 'template',
            message: 'Failed to unlink session. Please try again.',
          });
        }
      }
    },
    [sessionId, linkedSessions, syncToStore]
  );

  return {
    linkedSessions,
    showLinkDialog,
    setShowLinkDialog,
    patientSessions,
    loadingPatientSessions,
    isPatientSelected,
    handleOpenLinkDialog,
    handleAddLinkedSessions,
    handleRemoveLinkedSession,
  };
}
