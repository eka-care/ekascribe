'use client';

import { useMemo, useEffect, useRef, type CSSProperties } from 'react';
import { NotepadText } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import { SESSION_PHASE } from '@/constants/enums';

const ListeningIndicator = () => {
  const dotStyle = (delay: number): CSSProperties => ({
    width: 4,
    height: 4,
    borderRadius: '50%',
    animation: `listeningPulse 0.6s ${delay}ms ease-in-out infinite`,
  });

  return (
    <>
      <style>{`
        @keyframes listeningPulse {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
      <div className="flex items-center gap-1">
        <span className="flex items-center gap-[2px]">
          <span style={{ ...dotStyle(0), backgroundColor: '#999' }} />
          <span style={{ ...dotStyle(150), backgroundColor: '#999' }} />
          <span style={{ ...dotStyle(300), backgroundColor: '#215FFF' }} />
        </span>
        <span className="text-xs text-[#666] italic">Listening</span>
      </div>
    </>
  );
};

export function ChunkTranscriptDisplay({ sessionId }: { sessionId: string }) {
  const chunkTranscripts = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.chunk_transcripts || {}
  );
  const phase = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.phase);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isActivelyRecording = phase === SESSION_PHASE.RECORDING;

  const transcriptEntries = useMemo(() => {
    const sortedKeys = Object.keys(chunkTranscripts).sort(
      (a, b) => Number(a.replace(/\.[^.]+$/, '')) - Number(b.replace(/\.[^.]+$/, ''))
    );
    return sortedKeys.map((key) => chunkTranscripts[key]).filter(Boolean);
  }, [chunkTranscripts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptEntries]);

  if (transcriptEntries.length === 0) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center gap-3 text-center px-3">
        <NotepadText size={28} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-balance">
          Keep talking – your transcript will appear here soon.
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          {transcriptEntries.map((text, idx) => (
            <p key={idx} className="text-sm text-[#191919] leading-5">
              {text}
            </p>
          ))}
        </div>
        {isActivelyRecording && <ListeningIndicator />}
      </div>
    </div>
  );
}
