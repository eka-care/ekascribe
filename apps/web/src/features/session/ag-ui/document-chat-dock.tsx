'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X } from 'lucide-react';

import type { ChatPhase, ChatTurn } from './hooks/use-document-chat';

type Props = {
  turns: ChatTurn[];
  phase: ChatPhase;
  error: string | null;
  onSend: (text: string) => void;
  onClose?: () => void;
};

/**
 * "Edit with AI" dock — pinned to the bottom of the document view.
 *
 * Layout contract: render this as a `shrink-0` flex child below a
 * `flex-1 overflow-y-auto` content area. The dock itself never scrolls
 * away; its message list scrolls internally, and the input bar stays put.
 */
export function DocumentChatDock({ turns, phase, error, onSend, onClose }: Props) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const streaming = phase === 'streaming';
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  // History is shown only while the chat is in use. Focusing the input
  // expands it; clicking anywhere outside the dock (e.g. the note) collapses
  // back to the header + bar. Stays open while a reply streams. Clicks
  // inside the dock (messages, header) never collapse it.
  const expanded = focused || streaming;

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (streaming) return;
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [streaming]);

  // Keep the newest message in view (also when re-expanding).
  useEffect(() => {
    if (!expanded) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, expanded]);

  // Auto-grow the textarea up to a max, then let it scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const submit = () => {
    const text = input.trim();
    if (!text || streaming) return;
    onSend(text);
    setInput('');
  };

  const hasTurns = turns.length > 0;

  return (
    <div
      ref={dockRef}
      className="shrink-0 mx-4 mb-3 bg-white border border-[#e2e8f0] rounded-[14px] shadow-[0_10px_28px_-10px_rgba(11,18,32,0.18),0_2px_6px_-2px_rgba(11,18,32,0.08)]"
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#eef1f6]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#4a5568]" />
          <span className="text-[13px] font-semibold text-[#1a2233]">Edit with AI</span>
        </div>
        <button
          type="button"
          onClick={() => { setFocused(false); onClose?.(); }}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[#f4f6fa] text-[#94a3b8] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Chat history */}
      {expanded && hasTurns && (
        <div
          ref={listRef}
          className="px-3.5 pt-1.5 pb-1 flex flex-col gap-2 max-h-40 overflow-y-auto overscroll-contain"
        >
          {turns.map((turn) => (
            <ChatBubble key={turn.id} turn={turn} />
          ))}
        </div>
      )}

      {error && (
        <div className="mx-3.5 mt-1 text-xs text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Input row */}
      <div className="px-3.5 pt-1 pb-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={streaming}
            placeholder={
              streaming ? 'Working on it…' : 'Ask to add, remove, or rewrite any section…'
            }
            className="flex-1 resize-none bg-transparent py-[5px] text-[14px] leading-5 outline-none placeholder:text-[#94a3b8] disabled:opacity-60"
          />
          {!input.trim() && !streaming && (
            <span className="hidden sm:block shrink-0 self-center text-[10px] font-mono text-[#94a3b8] whitespace-nowrap pointer-events-none">
              ↵ Enter
            </span>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={streaming || !input.trim()}
            className="shrink-0 flex items-center gap-1.5 h-[34px] px-3 rounded-lg bg-[#0b1220] text-white transition-all hover:bg-[#1a2233] disabled:opacity-30 cursor-pointer disabled:cursor-default"
            aria-label="Send"
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span className="text-[13px] font-medium">Send</span>
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[#0b1220] text-white rounded-br-sm'
            : 'bg-[#f4f6fa] text-[#1a2233] rounded-bl-sm'
        }`}
      >
        {turn.content || (!turn.done ? <DotPulse /> : '')}
      </div>
    </div>
  );
}

function DotPulse() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" />
    </span>
  );
}
