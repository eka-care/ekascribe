import { useState, useEffect } from 'react';

export const VoiceAnimation = () => {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCycle((p) => p + 1), 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 md:gap-5">
      {/* Voice section */}
      <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 bg-card rounded-xl border border-border/30 shadow-xs">
        <svg viewBox="0 0 24 24" fill="none" className="text-primary w-5 h-5 md:w-6 md:h-6">
          <path
            d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
            fill="currentColor"
            opacity="0.2"
          />
          <path
            d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex items-center gap-0.5 md:gap-1 h-6">
          {[0, 0.08, 0.16, 0.12, 0.2, 0.24].map((delay, i) => (
            <div
              key={i}
              className="w-[3px] md:w-1 bg-primary rounded-full animate-wave"
              style={{ animationDelay: `${delay}s`, height: `${10 + (i % 3) * 5}px` }}
            />
          ))}
        </div>
      </div>

      {/* Flow dots */}
      <div className="flex items-center gap-1 md:gap-1.5">
        {[0, 0.2, 0.4].map((delay, i) => (
          <div
            key={i}
            className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-primary/40 animate-pulse"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>

      {/* Prescription */}
      <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 bg-card rounded-xl border border-border/30 shadow-xs">
        <svg viewBox="0 0 24 24" fill="none" className="text-primary w-5 h-5 md:w-6 md:h-6">
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            fill="currentColor"
            opacity="0.1"
          />
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="14,2 14,8 20,8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex flex-col gap-0.5 md:gap-1 w-12 md:w-16">
          {[0, 0.12, 0.24].map((delay, i) => (
            <div
              key={`${cycle}-${i}`}
              className="h-[3px] md:h-1 rounded-full bg-primary animate-line-appear"
              style={{
                animationDelay: `${delay}s`,
                width: i === 1 ? '70%' : i === 2 ? '85%' : '100%',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default VoiceAnimation;
