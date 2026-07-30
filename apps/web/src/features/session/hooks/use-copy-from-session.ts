'use client';

import { useCallback, useRef, useState } from 'react';
import { TPastSessionHistoryData } from '@/constants/types';
import { with401Retry } from '@/fetch-client/api-with-retry';
import useVoice2RxStore from '@/store/store';
import type { NormalizedDocument } from '../types';
import { normalizeDocuments } from '../utils/normalize-documents';
import {
  addNote,
  fetchDocumentContent,
  fetchDocumentJson,
  saveDocumentContent,
  saveDocumentJson,
} from '../services/document-service';
import * as sdkService from '../services/sdk-service';

const SESSIONS_PAGE_SIZE = 10;

export function useCopyFromSession({
  sessionId,
  patientOid,
}: {
  sessionId: string;
  patientOid?: string;
}) {
  const [sessions, setSessions] = useState<TPastSessionHistoryData[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const sessionsCountRef = useRef(SESSIONS_PAGE_SIZE);

  const [sessionNotes, setSessionNotes] = useState<NormalizedDocument[]>([]);
  const [loadingSessionNotes, setLoadingSessionNotes] = useState(false);

  const fetchSessions = useCallback(
    async (count: number, silent: boolean) => {
      if (!patientOid) return;
      silent ? setLoadingMoreSessions(true) : setLoadingSessions(true);
      try {
        const response = await with401Retry(
          () => sdkService.getSessionHistory({ txn_count: count, oid: patientOid }),
          'get patient session history for copy note'
        );
        if (response.status_code === 200 && response.data) {
          setSessions(response.data.filter((s) => s.txn_id !== sessionId));
          setHasMoreSessions(response.data.length >= count);
        } else {
          setSessions([]);
          setHasMoreSessions(false);
        }
      } catch {
        setSessions([]);
        setHasMoreSessions(false);
      } finally {
        silent ? setLoadingMoreSessions(false) : setLoadingSessions(false);
      }
    },
    [patientOid, sessionId]
  );

  const fetchPastSessions = useCallback(async () => {
    sessionsCountRef.current = SESSIONS_PAGE_SIZE;
    await fetchSessions(sessionsCountRef.current, false);
  }, [fetchSessions]);

  const fetchMoreSessions = useCallback(async () => {
    if (loadingSessions || loadingMoreSessions || !hasMoreSessions) return;
    sessionsCountRef.current += SESSIONS_PAGE_SIZE;
    await fetchSessions(sessionsCountRef.current, true);
  }, [fetchSessions, loadingSessions, loadingMoreSessions, hasMoreSessions]);

  const fetchSessionNotes = useCallback(async (otherSessionId: string) => {
    setLoadingSessionNotes(true);
    try {
      const response = await with401Retry(
        () => sdkService.getSessionDetails(otherSessionId, true, 'v2'),
        'get session details for copy note'
      );
      const { documents } = normalizeDocuments(response.data?.documents || []);
      setSessionNotes(documents);
    } catch {
      setSessionNotes([]);
    } finally {
      setLoadingSessionNotes(false);
    }
  }, []);

  const copyNoteIntoSession = useCallback(
    async (
      sourceSessionId: string,
      note: Pick<NormalizedDocument, 'document_id' | 'document_name' | 'get_url'>
    ): Promise<string | null> => {
      try {
        const [content, { tiptapJson }] = await Promise.all([
          fetchDocumentContent(sourceSessionId, note.document_id, note.get_url),
          fetchDocumentJson(sourceSessionId, note.document_id),
        ]);

        const newDoc = await addNote(sessionId, note.document_name || 'Note', 'notes', {
          skipStoreUpdate: true,
        });
        if (!newDoc) throw new Error('Failed to create note');

        await Promise.all([
          content
            ? saveDocumentContent(sessionId, newDoc.document_id, content, null)
            : Promise.resolve(true),
          tiptapJson
            ? saveDocumentJson(sessionId, newDoc.document_id, tiptapJson as Record<string, unknown>)
            : Promise.resolve(true),
        ]);

        useVoice2RxStore
          .getState()
          .addSessionV2Document(sessionId, { ...newDoc, content: content ?? '' });

        return newDoc.document_id;
      } catch (error) {
        console.error('copyNoteIntoSession error:', error);
        useVoice2RxStore.getState().setWarningInfo({
          screen: 'template',
          message: 'Failed to copy note. Please try again.',
        });
        return null;
      }
    },
    [sessionId]
  );

  return {
    sessions,
    loadingSessions,
    loadingMoreSessions,
    hasMoreSessions,
    fetchPastSessions,
    fetchMoreSessions,
    sessionNotes,
    loadingSessionNotes,
    fetchSessionNotes,
    copyNoteIntoSession,
  };
}
