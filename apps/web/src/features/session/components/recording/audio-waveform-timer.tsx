'use client';

import { Badge } from '@ui/src';
import { Timer } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import convertSecondsToMinutes from '@/utils/convert-seconds-to-minutes';

const BAR_WIDTH_PX = 2;
const BAR_GAP_PX = 1.5;
const MAX_HEIGHT_PX = 28;

const LiveWaveform = ({ amplitudes }: { amplitudes: number[] }) => {
  return (
    <div className="w-full h-8 flex items-center justify-center">
      <div
        className="w-full h-full flex items-center justify-end overflow-hidden"
        style={{ gap: `${BAR_GAP_PX}px`, padding: '6px 4px' }}
      >
        {amplitudes.map((amp, idx) => {
          const height = Math.max(2, Math.min(1, amp) * MAX_HEIGHT_PX);
          return (
            <div
              key={idx}
              className="bg-primary rounded-lg shrink-0"
              style={{
                width: `${BAR_WIDTH_PX}px`,
                height: `${height}px`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const EMPTY_AMPLITUDES: number[] = [];

export function AudioWaveformTimer({ sessionId }: { sessionId: string }) {
  const sessionDuration = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.session_duration || 0
  );
  const amplitudes = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.audio_amplitudes ?? EMPTY_AMPLITUDES
  );

  return (
    <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
      <div className="flex-1 min-w-0 sm:w-50">
        <LiveWaveform amplitudes={amplitudes} />
      </div>

      <Badge variant="outline" className="h-fit border-border rounded-lg">
        <Timer className="size-3" />
        <span className="font-bold">{convertSecondsToMinutes(sessionDuration)}</span>
      </Badge>
    </div>
  );
}
