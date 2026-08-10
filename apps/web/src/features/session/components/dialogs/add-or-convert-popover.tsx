'use client';

import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import {
  ClipboardPaste,
  File,
  FileText,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  NotepadText,
  Plus,
  Sparkles,
  Star,
  History,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@ui/src';
import type { TPastSessionHistoryData } from '@/constants/types';
import { formatContextDate } from '@/utils/shared-helpers';
import { useCopyFromSession } from '../../hooks/document/use-copy-from-session';
import { useSavedNotes } from '../../hooks/document/use-saved-notes';

interface AddOrConvertPopoverProps {
  sessionId: string;
  patientOid?: string;
  close: () => void;
  addPendingTab: (id: string, label: string) => void;
  removePendingTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  onAddNote: () => void;
  onAddTranscript?: () => void;
  templates?: { id: string; name: string }[];
  onStreamTemplate?: (template: { id: string; name: string }) => void;
  showConvertOption?: boolean;
  showGenerateTranscriptOption?: boolean;
}

type Submenu = 'stream' | 'copySessions' | 'copyNotes' | 'savedNotes' | null;

const MOBILE_BREAKPOINT = 640;

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'June',
  'July',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
];

function formatAddedDate(iso?: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  const day = date.getDate().toString().padStart(2, '0');
  const month = SHORT_MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);
  return `Added ${day} ${month} ${year}`;
}

export function AddOrConvertPopover({
  sessionId,
  patientOid,
  close,
  addPendingTab,
  removePendingTab,
  setActiveTab,
  onAddNote,
  onAddTranscript,
  templates = [],
  onStreamTemplate,
  showConvertOption = true,
  showGenerateTranscriptOption = true,
}: AddOrConvertPopoverProps) {
  const {
    sessions: copySessions,
    loadingSessions: loadingCopySessions,
    loadingMoreSessions,
    fetchPastSessions,
    fetchMoreSessions,
    sessionNotes: copySessionNotes,
    loadingSessionNotes: loadingCopySessionNotes,
    fetchSessionNotes,
    copyNoteIntoSession,
  } = useCopyFromSession({ sessionId, patientOid });

  const { notes: savedNotes } = useSavedNotes();

  const [activeSubmenu, setActiveSubmenu] = useState<Submenu>(null);
  const [selectedCopySession, setSelectedCopySession] = useState<TPastSessionHistoryData | null>(
    null
  );
  const [isMobile, setIsMobile] = useState(false);
  const subPanelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    if (isMobile) return;

    const el = subPanelRef.current;
    if (!el) return;
    el.style.left = '100%';
    el.style.right = 'auto';
    el.style.marginLeft = '0.25rem';
    el.style.marginRight = '0';

    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = 'auto';
      el.style.right = '100%';
      el.style.marginLeft = '0';
      el.style.marginRight = '0.25rem';
    }
  }, [activeSubmenu, isMobile]);

  const openStream = useCallback(() => setActiveSubmenu('stream'), []);
  const openSavedNotes = useCallback(() => setActiveSubmenu('savedNotes'), []);
  const goBack = useCallback(() => setActiveSubmenu(null), []);

  const openCopySessions = useCallback(() => {
    setActiveSubmenu('copySessions');
    setSelectedCopySession(null);
    fetchPastSessions();
  }, [fetchPastSessions]);

  const backToCopySessions = useCallback(() => setActiveSubmenu('copySessions'), []);

  const handleSelectCopySession = useCallback(
    (session: TPastSessionHistoryData) => {
      setSelectedCopySession(session);
      fetchSessionNotes(session.txn_id);
      setActiveSubmenu('copyNotes');
    },
    [fetchSessionNotes]
  );

  const handleSessionsScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
        fetchMoreSessions();
      }
    },
    [fetchMoreSessions]
  );

  const handlePickCopyNote = useCallback(
    async (
      note: { document_id: string; document_name: string; get_url: string | null },
      session: TPastSessionHistoryData
    ) => {
      close();
      const pendingId = `pending-copy-note-${note.document_id}`;
      addPendingTab(pendingId, note.document_name || 'Note');

      try {
        const newDocId = await copyNoteIntoSession(session.txn_id, note);
        if (newDocId) setActiveTab(newDocId);
      } finally {
        removePendingTab(pendingId);
      }
    },
    [close, addPendingTab, removePendingTab, setActiveTab, copyNoteIntoSession]
  );

  const handlePickSavedNote = useCallback(
    async (note: { document_id: string; document_name: string }) => {
      close();
      const pendingId = `pending-saved-note-${note.document_id}`;
      addPendingTab(pendingId, note.document_name || 'Note');

      try {
        const newDocId = await copyNoteIntoSession(sessionId, {
          document_id: note.document_id,
          document_name: note.document_name,
          get_url: null,
        });
        if (newDocId) setActiveTab(newDocId);
      } finally {
        removePendingTab(pendingId);
      }
    },
    [sessionId, close, addPendingTab, removePendingTab, setActiveTab, copyNoteIntoSession]
  );

  const renderCopySessionsList = () => (
    <div className="flex flex-col overflow-y-auto max-h-60 pb-3" onScroll={handleSessionsScroll}>
      {loadingCopySessions ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-[#767676]" />
        </div>
      ) : copySessions.length === 0 ? (
        <p className="px-3 py-4 text-sm text-[#767676]">No past sessions found for this patient</p>
      ) : (
        <>
          {copySessions.map((session) => (
            <button
              key={session.txn_id}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectCopySession(session);
              }}
              className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left"
            >
              <History className="w-4 h-4 text-[#767676] shrink-0" />
              <span className="text-sm text-[#191919]">
                {formatContextDate(session.created_at)}
              </span>
            </button>
          ))}
          {loadingMoreSessions && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#767676]" />
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderCopyNotesList = () => (
    <div className="flex flex-col overflow-y-auto max-h-60 pb-3">
      {loadingCopySessionNotes ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-[#767676]" />
        </div>
      ) : copySessionNotes.length === 0 ? (
        <p className="px-3 py-4 text-sm text-[#767676]">No notes in this session</p>
      ) : (
        copySessionNotes.map((note) => (
          <button
            key={note.document_id}
            onMouseDown={(e) => {
              e.preventDefault();
              if (selectedCopySession) handlePickCopyNote(note, selectedCopySession);
            }}
            className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left"
          >
            <FileText className="w-4 h-4 text-[#767676] shrink-0" />
            <span className="text-sm text-[#191919]">{note.document_name || 'Untitled note'}</span>
          </button>
        ))
      )}
    </div>
  );

  const renderFavouriteNotesList = () => {
    if (savedNotes.length === 0) {
      return <p className="px-3 py-3 text-sm text-[#767676]">No favourite notes yet</p>;
    }

    return (
      <div className="flex flex-col overflow-y-auto max-h-60 pb-3">
        {savedNotes.map((note) => {
          const addedOn = formatAddedDate(note.added_at);
          return (
            <button
              key={note.document_id}
              onMouseDown={(e) => {
                e.preventDefault();
                handlePickSavedNote(note);
              }}
              className="flex items-start gap-2 px-3 py-2 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left"
            >
              <NotepadText className="w-4 h-4 text-[#767676] shrink-0 mt-1" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-[#1A1A1A] truncate">
                  {note.document_name || 'Untitled note'}
                </span>
                {addedOn && <span className="text-xs text-[#767676] truncate">{addedOn}</span>}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderTemplateList = () => (
    <div className="flex flex-col overflow-y-auto max-h-60 pb-3">
      {templates.map((template) => (
        <button
          key={template.id}
          onMouseDown={(e) => {
            e.preventDefault();
            onStreamTemplate?.(template);
          }}
          className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left"
        >
          <LayoutGrid className="w-4 h-4 text-[#767676] shrink-0" />
          <span className="text-sm text-[#191919]">{template.name}</span>
        </button>
      ))}
    </div>
  );

  const renderCreateCustomButton = () => (
    <div className="border-t border-border p-3">
      <Button
        onClick={() => router.push('/template')}
        variant="outline"
        className="p-3 transition-colors cursor-pointer w-full"
      >
        <Plus className="w-4 h-4" />
        <span>Create custom template</span>
      </Button>
    </div>
  );

  // --- Mobile: drill-down panels (replace menu in place, no side flyout) ---

  // Convert to another template — mobile drill-down
  if (isMobile && activeSubmenu === 'stream') {
    return (
      <div className="flex flex-col w-77">
        <button
          onClick={goBack}
          className="flex items-center gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-t-lg"
        >
          <ChevronLeft className="w-4 h-4 text-[#6B7280] shrink-0" />
          <span className="text-sm font-semibold text-[#191919]">Convert to another template</span>
        </button>
        <div className="h-px bg-[#E5E7EB]" />
        {renderTemplateList()}
        {renderCreateCustomButton()}
      </div>
    );
  }

  // Copy note from previous session — mobile drill-down (session list)
  if (isMobile && activeSubmenu === 'copySessions') {
    return (
      <div className="flex flex-col w-77">
        <button
          onClick={goBack}
          className="flex items-center gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-t-lg"
        >
          <ChevronLeft className="w-4 h-4 text-[#6B7280] shrink-0" />
          <span className="text-sm font-semibold text-[#191919]">
            Copy note from previous session
          </span>
        </button>
        <div className="h-px bg-[#E5E7EB]" />
        {renderCopySessionsList()}
      </div>
    );
  }

  // Insert favourite note — mobile drill-down
  if (isMobile && activeSubmenu === 'savedNotes') {
    return (
      <div className="flex flex-col w-77">
        <button
          onClick={goBack}
          className="flex items-center gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-t-lg"
        >
          <ChevronLeft className="w-4 h-4 text-[#6B7280] shrink-0" />
          <span className="text-sm font-semibold text-[#191919]">Favourite notes</span>
        </button>
        <div className="h-px bg-[#E5E7EB]" />
        {renderFavouriteNotesList()}
      </div>
    );
  }

  // Copy note from previous session — mobile drill-down (notes list)
  if (isMobile && activeSubmenu === 'copyNotes') {
    return (
      <div className="flex flex-col w-77">
        <button
          onClick={backToCopySessions}
          className="flex items-center gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-t-lg"
        >
          <ChevronLeft className="w-4 h-4 text-[#6B7280] shrink-0" />
          <span className="text-sm font-semibold text-[#191919]">
            {selectedCopySession ? formatContextDate(selectedCopySession.created_at) : 'Notes'}
          </span>
        </button>
        <div className="h-px bg-[#E5E7EB]" />
        {renderCopyNotesList()}
      </div>
    );
  }

  // --- Root menu ---

  const hasTranscript = showGenerateTranscriptOption;
  const hasConvert = showConvertOption;
  const hasCopy = !!patientOid;
  const hasSavedNotes = savedNotes.length > 0;

  return (
    <div className="flex flex-col w-77">
      {/* Add blank note */}
      <button
        onClick={onAddNote}
        onMouseEnter={isMobile ? undefined : goBack}
        className={`flex items-start gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-t-lg ${
          !hasSavedNotes && !hasConvert && !hasCopy && !hasTranscript ? 'rounded-b-lg' : ''
        }`}
      >
        <File className="w-4 h-4 text-primary shrink-0 mt-1" />
        <div className="flex flex-col flex-1">
          <span className="text-sm font-medium text-[#191919]">Add blank note</span>
          <span className="text-xs text-[#6B7280]">Adds a new note tab</span>
        </div>
      </button>

      {/* Insert favourite note */}
      {hasSavedNotes && (
        <>
          <div className="h-px bg-[#E5E7EB]" />
          <div className="relative">
            <button
              onClick={isMobile ? openSavedNotes : undefined}
              onMouseEnter={isMobile ? undefined : openSavedNotes}
              className={`flex items-start gap-2 p-3 transition-colors cursor-pointer text-left w-full ${
                !hasConvert && !hasCopy && !hasTranscript ? 'rounded-b-lg' : ''
              } ${activeSubmenu === 'savedNotes' ? 'bg-[#E9EFFF]' : 'hover:bg-[#F5F5F5]'}`}
            >
              <Star className="w-4 h-4 shrink-0 text-primary mt-1" />
              <div className="flex flex-col flex-1">
                <span className="text-sm font-medium text-[#191919]">Insert favourite note</span>
                <span className="text-xs text-[#6B7280]">Reuse a note from any session</span>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0 text-[#9CA3AF] self-center" />
            </button>

            {!isMobile && activeSubmenu === 'savedNotes' && (
              <div
                ref={subPanelRef}
                className="absolute top-0 w-65 bg-white border border-[#D1D1D1] rounded-lg shadow-md z-50"
              >
                <div className="p-3 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.96px] text-[#767676]">
                    Favourite notes
                  </span>
                </div>
                {renderFavouriteNotesList()}
              </div>
            )}
          </div>
        </>
      )}

      {/* Copy note from previous session */}
      {hasCopy && (
        <>
          <div className="h-px bg-[#E5E7EB]" />
          <div className="relative">
            <button
              onClick={isMobile ? openCopySessions : undefined}
              onMouseEnter={isMobile ? undefined : openCopySessions}
              className={`flex items-start gap-2 p-3 transition-colors cursor-pointer text-left w-full ${
                !hasConvert && !hasTranscript ? 'rounded-b-lg' : ''
              } ${
                activeSubmenu === 'copySessions' || activeSubmenu === 'copyNotes'
                  ? 'bg-[#E9EFFF]'
                  : 'hover:bg-[#F5F5F5]'
              }`}
            >
              <History className="w-4 h-4 shrink-0 text-primary mt-1" />
              <div className="flex flex-col flex-1">
                <span className="text-sm font-medium text-[#191919]">
                  Copy note from previous session
                </span>
                <span className="text-xs text-[#6B7280]">Reuse a note from an earlier session</span>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0 text-[#9CA3AF] self-center" />
            </button>

            {!isMobile && (activeSubmenu === 'copySessions' || activeSubmenu === 'copyNotes') && (
              <div
                ref={subPanelRef}
                className="absolute top-0 w-65 bg-white border border-[#D1D1D1] rounded-lg shadow-lg z-50"
              >
                {activeSubmenu === 'copySessions' ? (
                  <>
                    <div className="p-3 pb-1">
                      <span className="text-sm font-semibold text-[#191919]">
                        Select a past session
                      </span>
                    </div>
                    {renderCopySessionsList()}
                  </>
                ) : (
                  <>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        backToCopySessions();
                      }}
                      className="flex items-center gap-2 p-3 pb-1 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left w-full"
                    >
                      <ChevronLeft className="w-4 h-4 text-[#6B7280] shrink-0" />
                      <span className="text-sm font-semibold text-[#191919]">
                        {selectedCopySession
                          ? formatContextDate(selectedCopySession.created_at)
                          : 'Notes'}
                      </span>
                    </button>
                    {renderCopyNotesList()}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Convert to another template */}
      {hasConvert && (
        <>
          <div className="h-px bg-[#E5E7EB]" />
          <div className="relative">
            <button
              onClick={isMobile ? openStream : undefined}
              onMouseEnter={isMobile ? undefined : openStream}
              className={`flex items-start gap-2 p-3 transition-colors cursor-pointer text-left w-full ${
                !hasTranscript ? 'rounded-b-lg' : ''
              } ${activeSubmenu === 'stream' ? 'bg-[#E9EFFF]' : 'hover:bg-[#F5F5F5]'}`}
            >
              <Sparkles className="w-4 h-4 shrink-0 text-primary mt-1" />
              <div className="flex flex-col flex-1">
                <span className="text-sm font-medium text-[#191919]">
                  Convert to another template
                </span>
                <span className="text-xs text-[#6B7280]">Reformat this note</span>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0 text-[#9CA3AF] self-center" />
            </button>

            {!isMobile && activeSubmenu === 'stream' && (
              <div
                ref={subPanelRef}
                className="absolute top-0 w-65 bg-white border border-[#D1D1D1] rounded-lg shadow-lg z-50"
              >
                <div className="p-3 pb-1">
                  <span className="text-sm font-semibold text-[#191919]">Stream with AI</span>
                </div>
                {renderTemplateList()}
                {renderCreateCustomButton()}
              </div>
            )}
          </div>
        </>
      )}

      {/* Generate from transcript */}
      {hasTranscript && (
        <>
          <div className="h-px bg-[#E5E7EB]" />
          <button
            onClick={onAddTranscript}
            onMouseEnter={isMobile ? undefined : goBack}
            className="flex items-start gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-b-lg"
          >
            <ClipboardPaste className="w-4 h-4 text-primary shrink-0 mt-1" />
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-[#191919]">Generate from transcript</span>
              <span className="text-xs text-[#6B7280]">Paste transcript to generate notes</span>
            </div>
          </button>
        </>
      )}
    </div>
  );
}
