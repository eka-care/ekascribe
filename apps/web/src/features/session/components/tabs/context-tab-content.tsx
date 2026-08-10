'use client';

import dynamic from 'next/dynamic';
import ContextItemsList from '@/features/session/components/context-items-list';
import useVoice2RxStore from '@/store/store';
import { SessionBodySkeleton } from '@/app/new-session/loading';
import { useContextTab } from '../../hooks/use-context-tab';
import type { TPastSessionHistoryData } from '@/constants/types';

const WysiwygEditor = dynamic(() => import('../../components/editor/tiptap-wysiwyg-editor'), {
  ssr: false,
});

interface ContextTabContentProps {
  sessionId: string;
  patientOid?: string;
  linkedSessions: TPastSessionHistoryData[];
  onRemoveLinkedSession: (txnId: string) => void;
}

export function ContextTabContent({
  sessionId,
  linkedSessions,
  onRemoveLinkedSession,
}: ContextTabContentProps) {
  const { contextContent, contextEditorRef, handleContextChange, saveContext, isLoadingContent } =
    useContextTab({ sessionId });

  if (isLoadingContent) {
    return <SessionBodySkeleton />;
  }

  return (
    <div className="flex-1 flex flex-col justify-between">
      <div className="flex-1 px-4 pb-4">
        <WysiwygEditor
          key="context"
          ref={contextEditorRef}
          initialValue={contextContent}
          onChange={() => {
            handleContextChange();
            useVoice2RxStore.getState().setDocSaveStatus(sessionId, 'context', 'typing');
          }}
          onBlur={async () => {
            const currentStatus =
              useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.ui?.save_status_by_doc?.[
                'context'
              ];
            if (currentStatus !== 'typing') return;
            const success = await saveContext();
            useVoice2RxStore
              .getState()
              .setDocSaveStatus(sessionId, 'context', success ? 'synced' : 'error');
          }}
          placeholder="Start typing here to add context..."
          showToolbar={true}
        />
      </div>
      <ContextItemsList
        linkedSessions={linkedSessions}
        onRemoveLinkedSession={onRemoveLinkedSession}
      />
    </div>
  );
}
