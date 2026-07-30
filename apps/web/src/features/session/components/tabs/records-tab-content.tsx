'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getAccessToken, refreshAccessToken } from '@/transport';
import { useHost } from '@/platform';
import { SdkProvider, SmartRecordsView, type SDKLog, type Environment, type MainView } from '@eka-care/medical-records-ui';
import '@eka-care/medical-records-ui/styles';
import mixpanel from 'mixpanel-browser';
import useVoice2RxStore from '@/store/store';
import { useMrDocumentTypes } from '../../hooks/use-mr-document-types';
import { NotePickerPopup } from './NotePickerPopup';
import type { NormalizedDocument } from '../../types';
// import type { AttachedDocument } from '../../hooks/use-session-context';
import {
  addNote,
  fetchDocumentContent,
  fetchDocumentJson,
  saveDocumentContent,
  saveDocumentJson,
} from '../../services/document-service';
import type { JSONContent } from '@tiptap/core';
import { markdownToTiptapJson, htmlToTiptapJson } from '../../services/markdown-to-tiptap-json';
import { htmlToMarkdown } from '../../components/editor/tiptap-wysiwyg-editor';
import {
  mergeCopiedVitalsIntoLabResults,
  copiedVitalsToMarkdownBlock,
  type CopiedVitalInput,
} from '../../ag-ui/editor/lab-result/lab-result-mapper';
import { codifyVitalRows } from '../../ag-ui/editor/lab-result/lab-result-codify';

interface RecordsTabContentProps {
  sessionId: string;
  patientOid?: string;
  bid?: string;
  oid?: string;
  // onAttachManyToContext: (docs: AttachedDocument[]) => void | Promise<void>;
  onGoToContext: () => void;
  onGoToTab: (documentId: string) => void;
}

const CUSTOM_NOTE_NAME = 'Notes';

type VitalNoteRow = CopiedVitalInput;

export function RecordsTabContent({
  sessionId,
  bid,
  patientOid,
  oid,
  // onAttachManyToContext,
  onGoToTab,
}: RecordsTabContentProps) {
  const { documentTypes, allowUpload } = useMrDocumentTypes();
  const isDesktop = useHost() === 'desktop';

  const setIsVitalsGridOpen = useVoice2RxStore((s) => s.setIsVitalsGridOpen);
  const handleViewChange = useCallback(
    (view: MainView) => setIsVitalsGridOpen(view.kind === 'smart'),
    [setIsVitalsGridOpen],
  );
  // RecordsTabContent is kept mounted (hidden, not unmounted) when the user
  // switches tabs, so this only fires on session teardown / genuine unmount.
  useEffect(() => () => setIsVitalsGridOpen(false), [setIsVitalsGridOpen]);

  const [notePicker, setNotePicker] = useState<{
    text: string;
    notes: NormalizedDocument[];
    anchor?: { x: number; y: number };
    vitalsRows?: VitalNoteRow[];
  } | null>(null);

  const pasteIntoNote = useCallback(
    async (note: NormalizedDocument, text: string, vitalsRows?: VitalNoteRow[]) => {
      const liveContent = useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.documents.find(
        (d) => d.document_id === note.document_id
      )?.content;
      const docid = useVoice2RxStore.getState().loggedInUserDetails?.oid;

      const [[existingContent, { tiptapJson }], codifiedVitalsRows] = await Promise.all([
        Promise.all([
          liveContent != null ? Promise.resolve(liveContent) : fetchDocumentContent(sessionId, note.document_id, note.get_url),
          fetchDocumentJson(sessionId, note.document_id),
        ]),
        vitalsRows && vitalsRows.length > 0 ? codifyVitalRows(vitalsRows, docid) : Promise.resolve(vitalsRows),
      ]);
      const existing = existingContent ?? '';
      const existingDoc: JSONContent =
        tiptapJson && typeof tiptapJson === 'object'
          ? (tiptapJson as JSONContent)
          : existing.trim()
            ? markdownToTiptapJson(existing)
            : { type: 'doc', content: [] };
      const baseContent = existingDoc.content ?? [];

      const isHtml = /<(p|div|table|ul|ol|h[1-6]|br|strong|em|span)\b/i.test(text);

      let block: string;
      let mergedContent: JSONContent[];
      if (codifiedVitalsRows && codifiedVitalsRows.length > 0) {
        block = copiedVitalsToMarkdownBlock(codifiedVitalsRows);
        mergedContent = mergeCopiedVitalsIntoLabResults(baseContent, codifiedVitalsRows);
      } else if (isHtml) {
        block = htmlToMarkdown(text);
        mergedContent = [...baseContent, ...(htmlToTiptapJson(text).content ?? [])];
      } else {
        const isMarkdown = /\*\*|#{1,3} /.test(text);
        block = isMarkdown
          ? text.trim().replace(/\n/g, '\n\n').replace(/\n{3,}/g, '\n\n')
          : text
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .join('\n\n');
        mergedContent = [...baseContent, ...(markdownToTiptapJson(block).content ?? [])];
      }

      const next = existing.trim() ? `${existing}\n\n${block}` : block;
      const json: JSONContent = { type: 'doc', content: mergedContent };

      const [jsonOk, mdOk] = await Promise.all([
        saveDocumentJson(sessionId, note.document_id, json as unknown as Record<string, unknown>),
        saveDocumentContent(sessionId, note.document_id, next, null),
      ]);
      const success = jsonOk && mdOk;
      if (success) {
        useVoice2RxStore.getState().setSessionV2Document(sessionId, note.document_id, { content: next });
      }
      useVoice2RxStore
        .getState()
        .setSessionV2Ui(sessionId, { pending_paste_scroll_doc_id: note.document_id });
      onGoToTab(note.document_id);
      toast.success('Copied to note');
    },
    [sessionId, onGoToTab],
  );

  const copyInFlight = useRef(false);
  const pendingResolve = useRef<((success: boolean) => void) | null>(null);
  const notePickerRef = useRef(notePicker);
  notePickerRef.current = notePicker;

  const handleCopyToNote = useCallback(
    (text: string, anchor?: { x: number; y: number }, vitalsRows?: VitalNoteRow[]) => {
      if (!text.trim()) return;
      if (copyInFlight.current) return;
      // Toggle: clicking again while picker is open closes it
      if (notePickerRef.current) {
        setNotePicker(null);
        pendingResolve.current?.(false);
        pendingResolve.current = null;
        return;
      }

      const docs =
        useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.documents ?? [];
      const notes = docs.filter((d) => d.status !== 'in-progress');

      if (notes.length === 0) {
        copyInFlight.current = true;
        return (async () => {
          try {
            const created = await addNote(sessionId, CUSTOM_NOTE_NAME, 'notes');
            if (created) await pasteIntoNote(created, text, vitalsRows);
          } finally {
            copyInFlight.current = false;
          }
        })();
      }

      return new Promise<boolean>((resolve) => {
        pendingResolve.current = resolve;
        setNotePicker({ text, notes, anchor, vitalsRows });
      });
    },
    [sessionId, pasteIntoNote],
  );

  const resolvePending = useCallback((success: boolean) => {
    pendingResolve.current?.(success);
    pendingResolve.current = null;
  }, []);

  const handlePickNote = useCallback(
    async (note: NormalizedDocument) => {
      if (!notePicker) return;
      const { text, vitalsRows } = notePicker;
      await pasteIntoNote(note, text, vitalsRows);
      setNotePicker(null);
      resolvePending(true);
    },
    [notePicker, pasteIntoNote, resolvePending],
  );

  // const handleAddToContext = useCallback(
  //   async (records: { documentId: string; name: string }[]) => {
  //     if (records.length === 0) return;
  //     await onAttachManyToContext(records.map((r) => ({ documentId: r.documentId, name: r.name })));
  //     onGoToContext();
  //     toast.success('Attached to context');
  //   },
  //   [onAttachManyToContext, onGoToContext],
  // );

  const environment = ((process.env.NEXT_PUBLIC_ENV || 'PROD') === 'PROD' ? 'prod' : 'dev') as Environment;

  const handleLog = useCallback((log: SDKLog) => {
    if (log.eventType === 'read') return;
    const { eventName, status, platform, patientOid: pOid, bid: lBid, params, message } = log;
    mixpanel.track(eventName, {
      status,
      platform,
      ...(pOid ? { patientOid: pOid } : {}),
      ...(lBid ? { bid: lBid } : {}),
      ...(message ? { message } : {}),
      ...(params ? { ...params } : {}),
    });
  }, []);

  const sdkConfig = useMemo(
    () => ({
      environment,
      // vaultBaseUrl: "",
      defaultHeaders: { 'client-id': 'doc-web', flavour: 'ekascribe-web' },
      accessToken: getAccessToken() ?? undefined,
      onUnauthorized: async () => (await refreshAccessToken()) ?? undefined,
      onLog: handleLog,
      oid,
    }),
    [environment, oid, handleLog],
  );

  return (
    <>
      <SdkProvider config={sdkConfig} bid={bid} patientId={patientOid} documentTypes={documentTypes}>
        <SmartRecordsView
          allowUpload={allowUpload}
          onCopyToNote={handleCopyToNote}
          onAddToContext={() => {}}
          hideOpenInNewTab={isDesktop}
          onToast={(msg, type) =>
            type === "error" ? toast.error(msg) : toast.success(msg)
          }
          onViewChange={handleViewChange}
        />
      </SdkProvider>
      {notePicker && (
        <NotePickerPopup
          notes={notePicker.notes}
          anchor={notePicker.anchor}
          onPick={handlePickNote}
          onCreateNote={async () => {
            const { text, vitalsRows } = notePicker;
            copyInFlight.current = true;
            try {
              const created = await addNote(sessionId, CUSTOM_NOTE_NAME, 'notes');
              if (created) await pasteIntoNote(created, text, vitalsRows);
            } finally {
              copyInFlight.current = false;
            }
            setNotePicker(null);
            resolvePending(true);
          }}
          onClose={() => { setNotePicker(null); resolvePending(false); }}
        />
      )}
    </>
  );
}
