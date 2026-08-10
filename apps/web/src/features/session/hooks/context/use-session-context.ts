'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TPastSessionHistoryData } from '@/constants/types';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../../services/sdk-service';

export const MAX_ATTACHMENTS = 1;

export function useSessionContext({
  sessionId,
  patientOid,
}: {
  sessionId: string;
  patientOid?: string;
}) {
  const [linkedSessions, setLinkedSessions] = useState<TPastSessionHistoryData[]>([]);

  const storeSessionContext = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.session_context
  );

  const isLocalWriteRef = useRef(false);

  useEffect(() => {
    if (!storeSessionContext) return;
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

  const fetchPatientSessions = useCallback(async (): Promise<TPastSessionHistoryData[]> => {
    if (!patientOid) return [];

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
        return response.data.filter((s) => s.txn_id !== sessionId);
      }
    } catch {
      // ignore
    }
    return [];
  }, [patientOid, sessionId]);

  const handleAddLinkedSessions = useCallback(
    async (sessions: TPastSessionHistoryData[]) => {
      const updated = [...linkedSessions, ...sessions];
      setLinkedSessions(updated);
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
    isPatientSelected,
    fetchPatientSessions,
    handleAddLinkedSessions,
    handleRemoveLinkedSession,
  };
}
