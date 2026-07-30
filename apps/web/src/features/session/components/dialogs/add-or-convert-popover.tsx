'use client';

import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import {
  Bookmark,
  File,
  FileText,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  Plus,
  Sparkles,
  History,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@ui/src';
import type { TPastSessionHistoryData } from '@/constants/types';
import { formatContextDate } from '@/utils/shared-helpers';
import type { NormalizedDocument } from '../../types';
import { useCopyFromSession } from '../../hooks/use-copy-from-session';
import type { SavedNote } from '../../hooks/use-saved-notes';

interface AddOrConvertPopoverProps {
  sessionId: string;
  patientOid?: string;
  onAddNote: () => void;
  onAddTranscript?: () => void;
  templates?: { id: string; name: string }[];
  onConvertTemplate?: (template: { id: string; name: string }) => void;
  onStreamTemplate?: (template: { id: string; name: string }) => void;
  showConvertOption?: boolean;
  showGenerateTranscriptOption?: boolean;
  onPickCopyNote?: (note: NormalizedDocument, session: TPastSessionHistoryData) => void;
  savedNotes?: SavedNote[];
  onPickSavedNote?: (note: SavedNote) => void;
}

type Submenu = 'stream' | 'copySessions' | 'copyNotes' | 'savedNotes' | null;

const MOBILE_BREAKPOINT = 640; // Tailwind `sm`

export function AddOrConvertPopover({
  sessionId,
  patientOid,
  onAddNote,
  onAddTranscript,
  templates = [],
  onStreamTemplate,
  showConvertOption = true,
  showGenerateTranscriptOption = true,
  onPickCopyNote,
  savedNotes = [],
  onPickSavedNote,
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
  } = useCopyFromSession({ sessionId, patientOid });

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

  // Desktop only: position the side flyout to the right by default, flip left if it overflows.
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
              <History className="w-4 h-4 text-[#6B7280] shrink-0" />
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
              if (selectedCopySession) onPickCopyNote?.(note, selectedCopySession);
            }}
            className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left"
          >
            <FileText className="w-4 h-4 text-[#6B7280] shrink-0" />
            <span className="text-sm text-[#191919]">{note.document_name || 'Untitled note'}</span>
          </button>
        ))
      )}
    </div>
  );

  const renderSavedNotesList = () => {
    if (savedNotes.length === 0) {
      return <p className="px-3 py-3 text-sm text-[#767676]">No saved notes yet</p>;
    }

    return (
      <div className="flex flex-col overflow-y-auto max-h-60 pb-3">
        {savedNotes.map((note) => (
          <button
            key={note.document_id}
            onMouseDown={(e) => {
              e.preventDefault();
              onPickSavedNote?.(note);
            }}
            className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left"
          >
            <Bookmark className="w-4 h-4 text-[#6B7280] shrink-0" />
            <span className="text-sm text-[#191919]">{note.document_name || 'Untitled note'}</span>
          </button>
        ))}
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
          <LayoutGrid className="w-4 h-4 text-[#6B7280] shrink-0" />
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

  // --- Mobile: drill-down panels replace the menu in place (no side flyout) ---

  if (isMobile && activeSubmenu === 'stream') {
    return (
      <div className="flex flex-col w-[308px]">
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

  if (isMobile && activeSubmenu === 'copySessions') {
    return (
      <div className="flex flex-col w-[308px]">
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

  if (isMobile && activeSubmenu === 'savedNotes') {
    return (
      <div className="flex flex-col w-[308px]">
        <button
          onClick={goBack}
          className="flex items-center gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-t-lg"
        >
          <ChevronLeft className="w-4 h-4 text-[#6B7280] shrink-0" />
          <span className="text-sm font-semibold text-[#191919]">Saved notes</span>
        </button>
        <div className="h-px bg-[#E5E7EB]" />
        {renderSavedNotesList()}
      </div>
    );
  }

  if (isMobile && activeSubmenu === 'copyNotes') {
    return (
      <div className="flex flex-col w-[308px]">
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

  // --- Root menu (desktop opens side flyouts on hover; mobile drills in on click) ---

  const hasTranscript = showGenerateTranscriptOption;
  const hasConvert = showConvertOption;
  const hasCopy = !!patientOid;
  const hasSavedNotes = !!onPickSavedNote;

  return (
    <div className="flex flex-col w-[308px]">
      {/* Add blank note */}
      <button
        onClick={onAddNote}
        onMouseEnter={isMobile ? undefined : goBack}
        className={`flex items-center gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left rounded-t-lg ${
          !hasTranscript && !hasConvert && !hasCopy && !hasSavedNotes ? 'rounded-b-lg' : ''
        }`}
      >
        <File className="w-4 h-4 text-[#6B7280] shrink-0" />
        <div className="flex flex-col flex-1">
          <span className="text-sm font-medium text-[#191919]">Add blank note</span>
          <span className="text-xs text-[#6B7280]">Adds a new note tab</span>
        </div>
      </button>

      {(hasTranscript || hasConvert || hasCopy || hasSavedNotes) && (
        <div className="h-px bg-[#E5E7EB]" />
      )}

      {/* Generate from transcript */}
      {hasTranscript && (
        <>
          <button
            onClick={onAddTranscript}
            onMouseEnter={isMobile ? undefined : goBack}
            className={`flex items-center gap-2 p-3 hover:bg-[#F5F5F5] transition-colors cursor-pointer text-left ${
              !hasConvert && !hasCopy && !hasSavedNotes ? 'rounded-b-lg' : ''
            }`}
          >
            <FileText className="w-4 h-4 text-[#6B7280] shrink-0" />
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-[#191919]">Generate from transcript</span>
              <span className="text-xs text-[#6B7280]">Paste transcript to generate notes</span>
            </div>
          </button>
          {(hasConvert || hasCopy || hasSavedNotes) && <div className="h-px bg-[#E5E7EB]" />}
        </>
      )}

      {/* Convert to another template */}
      {hasConvert && (
        <div className="relative">
          <button
            onClick={isMobile ? openStream : undefined}
            onMouseEnter={isMobile ? undefined : openStream}
            className={`flex items-center gap-2 p-3 transition-colors cursor-pointer text-left w-full ${
              !hasCopy && !hasSavedNotes ? 'rounded-b-lg' : ''
            } ${activeSubmenu === 'stream' ? 'bg-[#F0F0FF]' : 'hover:bg-[#F5F5F5]'}`}
          >
            <Sparkles
              className="w-4 h-4 shrink-0"
              style={{ color: activeSubmenu === 'stream' ? '#215FFF' : '#6B7280' }}
            />
            <div className="flex flex-col flex-1">
              <span
                className={`text-sm font-medium ${
                  activeSubmenu === 'stream' ? 'text-[#215FFF]' : 'text-[#191919]'
                }`}
              >
                Convert to another template
              </span>
              <span className="text-xs text-[#6B7280]">Reformat this note</span>
            </div>
            <ChevronRight
              className="w-4 h-4 shrink-0"
              style={{ color: activeSubmenu === 'stream' ? '#215FFF' : '#9CA3AF' }}
            />
          </button>

          {!isMobile && activeSubmenu === 'stream' && (
            <div
              ref={subPanelRef}
              className="absolute top-0 w-[260px] bg-white border border-[#D1D1D1] rounded-lg shadow-lg z-50"
            >
              <div className="p-3 pb-1">
                <span className="text-sm font-semibold text-[#191919]">Stream with AI</span>
              </div>
              {renderTemplateList()}
              {renderCreateCustomButton()}
            </div>
          )}
        </div>
      )}

      {hasCopy && <div className="h-px bg-[#E5E7EB]" />}

      {/* Copy note from previous session */}
      {hasCopy && (
        <div className="relative">
          <button
            onClick={isMobile ? openCopySessions : undefined}
            onMouseEnter={isMobile ? undefined : openCopySessions}
            className={`flex items-center gap-2 p-3 transition-colors cursor-pointer text-left w-full ${
              !hasSavedNotes ? 'rounded-b-lg' : ''
            } ${
              activeSubmenu === 'copySessions' || activeSubmenu === 'copyNotes'
                ? 'bg-[#F0F0FF]'
                : 'hover:bg-[#F5F5F5]'
            }`}
          >
            <History
              className="w-4 h-4 shrink-0"
              style={{
                color:
                  activeSubmenu === 'copySessions' || activeSubmenu === 'copyNotes'
                    ? '#215FFF'
                    : '#6B7280',
              }}
            />
            <div className="flex flex-col flex-1">
              <span
                className={`text-sm font-medium ${
                  activeSubmenu === 'copySessions' || activeSubmenu === 'copyNotes'
                    ? 'text-[#215FFF]'
                    : 'text-[#191919]'
                }`}
              >
                Copy note from previous session
              </span>
              <span className="text-xs text-[#6B7280]">Reuse a note from an earlier session</span>
            </div>
            <ChevronRight
              className="w-4 h-4 shrink-0"
              style={{
                color:
                  activeSubmenu === 'copySessions' || activeSubmenu === 'copyNotes'
                    ? '#215FFF'
                    : '#9CA3AF',
              }}
            />
          </button>

          {!isMobile && (activeSubmenu === 'copySessions' || activeSubmenu === 'copyNotes') && (
            <div
              ref={subPanelRef}
              className="absolute top-0 w-[260px] bg-white border border-[#D1D1D1] rounded-lg shadow-lg z-50"
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
      )}

      {hasSavedNotes && <div className="h-px bg-[#E5E7EB]" />}

      {/* Insert saved note */}
      {hasSavedNotes && (
        <div className="relative">
          <button
            onClick={isMobile ? openSavedNotes : undefined}
            onMouseEnter={isMobile ? undefined : openSavedNotes}
            className={`flex items-center gap-2 p-3 transition-colors cursor-pointer text-left w-full rounded-b-lg ${
              activeSubmenu === 'savedNotes' ? 'bg-[#F0F0FF]' : 'hover:bg-[#F5F5F5]'
            }`}
          >
            <Bookmark
              className="w-4 h-4 shrink-0"
              style={{ color: activeSubmenu === 'savedNotes' ? '#215FFF' : '#6B7280' }}
            />
            <div className="flex flex-col flex-1">
              <span
                className={`text-sm font-medium ${
                  activeSubmenu === 'savedNotes' ? 'text-[#215FFF]' : 'text-[#191919]'
                }`}
              >
                Insert saved note
              </span>
              <span className="text-xs text-[#6B7280]">Reuse a note saved from any session</span>
            </div>
            <ChevronRight
              className="w-4 h-4 shrink-0"
              style={{ color: activeSubmenu === 'savedNotes' ? '#215FFF' : '#9CA3AF' }}
            />
          </button>

          {!isMobile && activeSubmenu === 'savedNotes' && (
            <div
              ref={subPanelRef}
              className="absolute top-0 w-[260px] bg-white border border-[#D1D1D1] rounded-lg shadow-lg z-50"
            >
              <div className="p-3 pb-1">
                <span className="text-sm font-semibold text-[#191919]">Saved notes</span>
              </div>
              {renderSavedNotesList()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
