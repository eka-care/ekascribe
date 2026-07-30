'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Volume2, Square, Pause, Play } from 'lucide-react';

interface SpeechScriptTrackerProps {
  script: string;
  isRecording: boolean;
  isPaused: boolean;
  className?: string;
  language?: string;
  onTranscriptChange?: (transcript: string) => void;
}

const SpeechScriptTracker: React.FC<SpeechScriptTrackerProps> = ({
  script,
  isPaused,
  className = '',
  language = 'en-US',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTTSPaused, setIsTTSPaused] = useState(false);
  const [ttsProgress, setTTSProgress] = useState(0);
  const [spokenCharIndex, setSpokenCharIndex] = useState(-1);

  const handleReadAloud = useCallback(() => {
    if (isSpeaking && !isTTSPaused) {
      window.speechSynthesis.pause();
      setIsTTSPaused(true);
      return;
    }

    if (isSpeaking && isTTSPaused) {
      window.speechSynthesis.resume();
      setIsTTSPaused(false);
      return;
    }

    // Start new speech
    window.speechSynthesis.cancel();
    setSpokenCharIndex(-1);
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.lang = language;
    utterance.rate = 1;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsTTSPaused(false);
      setTTSProgress(0);
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setSpokenCharIndex(event.charIndex + event.charLength);
        const progress = (event.charIndex / script.length) * 100;
        setTTSProgress(Math.min(progress, 100));
      }
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsTTSPaused(false);
      setTTSProgress(100);
      setSpokenCharIndex(script.length);
      setTimeout(() => {
        setTTSProgress(0);
        setSpokenCharIndex(-1);
      }, 1500);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsTTSPaused(false);
      setTTSProgress(0);
      setSpokenCharIndex(-1);
    };

    window.speechSynthesis.speak(utterance);
  }, [isSpeaking, isTTSPaused, script, language]);

  const handleStopReading = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsTTSPaused(false);
    setTTSProgress(0);
    setSpokenCharIndex(-1);
  }, []);

  // Pause/resume TTS based on isPaused prop
  const prevIsPausedRef = useRef(isPaused);
  useEffect(() => {
    if (prevIsPausedRef.current === isPaused) return;
    prevIsPausedRef.current = isPaused;

    if (!isSpeaking) return;

    if (isPaused) {
      window.speechSynthesis.pause();
      setIsTTSPaused(true);
    } else {
      window.speechSynthesis.resume();
      setIsTTSPaused(false);
    }
  }, [isPaused, isSpeaking]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const spokenText = spokenCharIndex > 0 ? script.slice(0, spokenCharIndex) : '';
  const remainingText = spokenCharIndex > 0 ? script.slice(spokenCharIndex) : script;

  return (
    <Card
      className={`h-fit pt-2 pb-0 border-border rounded-2xl gap-0 m-4 overflow-hidden ${className}`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between px-4">
          <p className="text-center text-sm text-secondary-foreground flex-1">
            Read the script below aloud
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleReadAloud}
              title={isSpeaking && !isTTSPaused ? 'Pause' : isTTSPaused ? 'Resume' : 'Read aloud'}
            >
              {isSpeaking && !isTTSPaused ? (
                <Pause className="h-4 w-4" />
              ) : isTTSPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            {isSpeaking && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleStopReading}
                title="Stop reading"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <CardContent className="px-0">
          <div
            ref={containerRef}
            className="rounded-2xl bg-accent p-4 border-t border-sidebar-border max-h-25 overflow-y-auto"
          >
            <p className="transition-all duration-500 ease-out leading-relaxed relative text-sm">
              {spokenCharIndex > 0 ? (
                <>
                  <span className="font-bold">{spokenText}</span>
                  {remainingText}
                </>
              ) : (
                script
              )}
            </p>
          </div>
        </CardContent>
      </div>

      {/* TTS Progress bar */}
      <div className="h-1.5 rounded-b-2xl overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(100, Math.max(0, ttsProgress))}%`,
          }}
        />
      </div>
    </Card>
  );
};

export default SpeechScriptTracker;
