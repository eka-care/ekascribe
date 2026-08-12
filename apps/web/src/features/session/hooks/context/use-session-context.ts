'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TPastSessionHistoryData } from '@/constants/types';
import { with401Retry } from '@/fetch-client/api-with-retry';
import useVoice2RxStore from '@/store/store';
import * as sdkService from '../../services/sdk-service';

/** How many recent sessions the link dialog offers. */
export const PAST_SESSIONS_COUNT = 10;

export function useSessionContext({ sessionId }: { sessionId: string }) {
  const [linkedSessions, setLinkedSessions] = useState<TPastSessionHistoryData[]>([]);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [pastSessions, setPastSessions] = useState<TPastSessionHistoryData[]>([]);
  const [loadingPastSessions, setLoadingPastSessions] = useState(false);

  // Subscribe reactively so this re-runs when loadSessionDetails populates session_context
  const storeSessionContext = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.session_context
  );

  // Skip the restore effect when we ourselves wrote to the store (via syncToStore)
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
        ...(s.title ? { session_details: { title: s.title } } : {}),
      }))
    );
  }, [storeSessionContext]);

  // Mirror local state into the store so links survive navigation
  const syncToStore = useCallback(
    (sessions: TPastSessionHistoryData[]) => {
      isLocalWriteRef.current = true;
      useVoice2RxStore.getState().setSessionV2Content(sessionId, {
        session_context: {
          past_sessions: sessions.map((s) => ({
            session_id: s.txn_id,
            date_epoch: s.created_at ? Math.floor(new Date(s.created_at).getTime() / 1000) : 0,
            ...(s.session_details?.title ? { title: s.session_details.title } : {}),
          })),
        },
      });
    },
    [sessionId]
  );

  const handleOpenLinkDialog = useCallback(async () => {
    setShowLinkDialog(true);
    setLoadingPastSessions(true);

    try {
      const response = await with401Retry(
        () => sdkService.getSessionHistory({ txn_count: PAST_SESSIONS_COUNT }),
        'get session history'
      );
      if (response.status_code === 200 && response.data) {
        setPastSessions(response.data.filter((s) => s.txn_id !== sessionId));
      } else {
        setPastSessions([]);
      }
    } catch {
      setPastSessions([]);
    } finally {
      setLoadingPastSessions(false);
    }
  }, [sessionId]);

  const handleAddLinkedSessions = useCallback(
    async (sessions: TPastSessionHistoryData[]) => {
      const updated = [...linkedSessions, ...sessions];
      setLinkedSessions(updated);
      setShowLinkDialog(false);
      syncToStore(updated);

      if (!sessionId || sessions.length === 0) return;

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
        toast.error('Failed to link sessions. Please try again.');
      }
    },
    [sessionId, linkedSessions, syncToStore]
  );

  const handleRemoveLinkedSession = useCallback(
    async (txnId: string) => {
      const updated = linkedSessions.filter((s) => s.txn_id !== txnId);
      setLinkedSessions(updated);
      syncToStore(updated);

      if (!sessionId) return;

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
        toast.error('Failed to unlink session. Please try again.');
      }
    },
    [sessionId, linkedSessions, syncToStore]
  );

  return {
    linkedSessions,
    showLinkDialog,
    setShowLinkDialog,
    pastSessions,
    loadingPastSessions,
    handleOpenLinkDialog,
    handleAddLinkedSessions,
    handleRemoveLinkedSession,
  };
}
