'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TPastSessionHistoryData } from '@/constants/types';
import { with401Retry } from '@/fetch-client/api-with-retry';
import useVoice2RxStore from '@/store/store';
import * as sdkService from '../services/sdk-service';

export type AttachedDocument = {
  documentId: string;
  name: string;
};

export const MAX_ATTACHMENTS = 1;

export function useSessionContext({
  sessionId,
  patientOid,
}: {
  sessionId: string;
  patientOid?: string;
}) {
  const [linkedSessions, setLinkedSessions] = useState<TPastSessionHistoryData[]>([]);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showAttachmentsDialog, setShowAttachmentsDialog] = useState(false);
  const [attachedDocument, setAttachedDocument] = useState<AttachedDocument | null>(null);
  const [patientSessions, setPatientSessions] = useState<TPastSessionHistoryData[]>([]);
  const [loadingPatientSessions, setLoadingPatientSessions] = useState(false);

  // Subscribe reactively so the effect re-runs when loadSessionDetails populates session_context
  const storeSessionContext = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.session_context
  );

  // Restore linked sessions and attachment from V2 store session_context.
  // API returns: { past_sessions: [{ session_id, date_epoch }], attachments: [{ id, patient_oid }] }
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
    const attachments = storeSessionContext.attachments ?? [];

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

    setAttachedDocument(
      attachments.length > 0 ? { documentId: attachments[0].id, name: 'Attachment' } : null
    );
  }, [storeSessionContext]);

  // Sync local state back to store so context survives navigation
  const syncToStore = useCallback(
    (sessions: TPastSessionHistoryData[], attachment: AttachedDocument | null) => {
      isLocalWriteRef.current = true;
      useVoice2RxStore.getState().setSessionV2Content(sessionId, {
        session_context: {
          past_sessions: sessions.map((s) => ({
            session_id: s.txn_id,
            date_epoch: s.created_at ? Math.floor(new Date(s.created_at).getTime() / 1000) : 0,
          })),
          attachments: attachment ? [{ id: attachment.documentId }] : [],
        },
      });
    },
    [sessionId]
  );

  const isPatientSelected = !!patientOid;

  const handleOpenLinkDialog = useCallback(async () => {
    if (!patientOid) return;
    setShowLinkDialog(true);
    setShowAttachmentsDialog(false);
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
      syncToStore(updated, attachedDocument);

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
    [sessionId, linkedSessions, attachedDocument, syncToStore]
  );

  const handleRemoveLinkedSession = useCallback(
    async (txnId: string) => {
      const updated = linkedSessions.filter((s) => s.txn_id !== txnId);
      setLinkedSessions(updated);
      syncToStore(updated, attachedDocument);

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
    [sessionId, linkedSessions, attachedDocument, syncToStore]
  );

  const handleAttach = useCallback(
    async (doc: AttachedDocument) => {
      setAttachedDocument(doc);

      setShowAttachmentsDialog(false);
      syncToStore(linkedSessions, doc);
      if (sessionId) {
        try {
          await with401Retry(
            () =>
              sdkService.addSessionContext({
                txn_id: sessionId,
                context: {
                  attachments: [
                    {
                      id: doc.documentId,
                      ...(patientOid ? { patient_oid: patientOid } : {}),
                    },
                  ],
                },
              }),
            'add attachment context'
          );
        } catch {
          // Attachment add failed — UI already updated optimistically
        }
      }
    },
    [sessionId, patientOid, linkedSessions, syncToStore]
  );

 const handleRemoveAttachment = useCallback(async () => {
    const docId = attachedDocument?.documentId;
    setAttachedDocument(null);
    syncToStore(linkedSessions, null);

    if (sessionId && docId) {
      try {
        await with401Retry(
          () =>
            sdkService.removeSessionContext({
              txn_id: sessionId,
              context: {
                attachments: [
                  {
                    id: docId,
                    ...(patientOid ? { patient_oid: patientOid } : {}),
                  },
                ],
              },
            }),
          'remove attachment context'
        );
      } catch {
        // Attachment remove failed — UI already updated optimistically
      }
    }
  }, [sessionId, attachedDocument, patientOid, linkedSessions, syncToStore]);

  return {
    linkedSessions,
    showLinkDialog,
    setShowLinkDialog,
    showAttachmentsDialog,
    setShowAttachmentsDialog,
    attachedDocument,
    patientSessions,
    loadingPatientSessions,
    isPatientSelected,
    handleOpenLinkDialog,
    handleAddLinkedSessions,
    handleRemoveLinkedSession,
    handleAttach,
    handleRemoveAttachment,
  };
}
