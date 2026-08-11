'use client';

import { forwardRef, useImperativeHandle } from 'react';
import dynamic from 'next/dynamic';
import useVoice2RxStore from '@/store/store';
import { DelayedSessionBodySkeleton } from '@/app/new-session/loading';
import { useContextEditor } from '../../hooks/context/use-context-editor';
import { buildScribeEditorExtensions } from '../../ag-ui/editor/editor-extensions';

const WysiwygEditor = dynamic(() => import('../../components/editor/tiptap-wysiwyg-editor'), {
  ssr: false,
});

export type ContextTabContentHandle = {
  save: () => Promise<boolean>;
};

interface ContextTabContentProps {
  sessionId: string;
}

export const ContextTabContent = forwardRef<ContextTabContentHandle, ContextTabContentProps>(
  function ContextTabContent(
    { sessionId },
    ref
  ) {
    const {
      contextContent,
      contextInitialJSON,
      contextEditorRef,
      handleContextChange,
      saveContext,
      isLoadingContent,
    } = useContextEditor({ sessionId, loadContent: true });

    useImperativeHandle(ref, () => ({ save: saveContext }), [saveContext]);

    if (isLoadingContent) {
      return <DelayedSessionBodySkeleton />;
    }

    return (
      <div className="flex-1 flex flex-col justify-between min-h-0">
        <div className="flex-1 px-4 pb-4">
          <WysiwygEditor
            key="context"
            ref={contextEditorRef}
            initialValue={contextContent}
            initialJSON={contextInitialJSON}
            customExtensions={buildScribeEditorExtensions()}
            onChange={() => {
              handleContextChange();
              useVoice2RxStore.getState().setDocSaveStatus(sessionId, 'context', 'typing');
            }}
            onBlur={async () => {
              const currentStatus =
                useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.ui
                  ?.save_status_by_doc?.['context'];
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
      </div>
    );
  }
);
