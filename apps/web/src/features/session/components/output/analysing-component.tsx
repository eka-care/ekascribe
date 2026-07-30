'use client';

import VoiceAnimation from '@/assets/voice-animation';

const AnalysingStateDisplay = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative">
      <div className="flex flex-col space-y-8 items-center justify-center">
        <div className="flex flex-col space-y-1 items-center text-center">
          <h3 className="text-lg sm:text-xl font-semibold leading-7 text-foreground">
            Analysing your conversation
          </h3>
          <p className="text-sm font-normal leading-5 text-muted-foreground">
            Generating structured output
          </p>
        </div>

        <VoiceAnimation />
      </div>
    </div>
  );
};

export default AnalysingStateDisplay;
