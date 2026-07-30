'use client';

import { useEffect, useRef, useState } from 'react';
import { getPlatform } from '@/platform';

interface Options {
  enabled: boolean;
  deviceId: string;
  barCount: number;
}

export const useMicrophoneVisualizer = ({ enabled, deviceId, barCount }: Options): number[] => {
  const [levels, setLevels] = useState<number[]>(() => new Array(barCount).fill(0));

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const stop = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };

    if (!enabled) {
      stop();
      setLevels(new Array(barCount).fill(0));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        stop();
        const stream = await getPlatform().audioCapture!.start({ deviceId: deviceId || undefined });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch {}
        }
        if (cancelled) return;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const binSize = Math.max(1, Math.floor(bufferLength / barCount));

        const tick = () => {
          analyser.getByteFrequencyData(dataArray);
          const next = Array.from({ length: barCount }, (_, i) => {
            const begin = i * binSize;
            let sum = 0;
            for (let j = 0; j < binSize && begin + j < dataArray.length; j += 1) {
              sum += dataArray[begin + j];
            }
            return Math.min(1, sum / binSize / 255);
          });
          setLevels(next);
          animationFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setLevels(new Array(barCount).fill(0));
      }
    })();

    return () => {
      cancelled = true;
      stop();
      setLevels(new Array(barCount).fill(0));
    };
  }, [enabled, deviceId, barCount]);

  return levels;
};
