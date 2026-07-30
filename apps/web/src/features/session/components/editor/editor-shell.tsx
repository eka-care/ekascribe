'use client';

import type { ReactNode } from 'react';
import { DocumentChatDock } from '../../ag-ui/document-chat-dock';
import type { ChatPhase, ChatTurn } from '../../ag-ui/hooks/use-document-chat';

type EditorChat = {
  turns: ChatTurn[];
  phase: ChatPhase;
  error: string | null;
  send: (text: string) => void;
};

type Props = {
  chatDockOpen: boolean;
  chatDockEnabled?: boolean;
  chat: EditorChat;
  onCloseChatDock: () => void;
  children: ReactNode;
};

export function EditorShell({
  chatDockOpen,
  chatDockEnabled = true,
  chat,
  onCloseChatDock,
  children,
}: Props) {
  return (
    <div className="flex-1 min-h-0 h-full flex flex-col">
      {children}

      {chatDockOpen && chatDockEnabled && (
        <DocumentChatDock
          turns={chat.turns}
          phase={chat.phase}
          error={chat.error}
          onSend={chat.send}
          onClose={onCloseChatDock}
        />
      )}
    </div>
  );
}
