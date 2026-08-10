'use client';

import { Mic, ArrowUpRight } from 'lucide-react';

const MicPermissionScreen = () => {
  return (
    <main className="min-h-full w-full flex flex-col items-center justify-center pl-56 pr-6 max-[680px]:px-6 py-20 bg-[#FAFAF7] relative overflow-x-hidden">
      {/* Arrow guide — swirly scribble pointing toward browser permission popup in top-left */}
      <div
        className="fixed pointer-events-none z-10 top-[max(16px,calc(50%-340px))] left-[max(16px,calc(50%-120px))] w-[200px] h-[140px] max-[680px]:top-[calc(50%-200px)] max-[680px]:left-[calc(50%-190px)] max-[680px]:w-[130px] max-[680px]:h-[110px] max-[480px]:top-[calc(50%-180px)] max-[480px]:left-[calc(50%-140px)] max-[480px]:w-[100px] max-[480px]:h-[90px]"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 380 260"
          preserveAspectRatio="xMidYMid meet"
          className="block w-full h-full overflow-visible"
        >
          <path
            d="M 350 210 C 310 235, 260 240, 230 220 C 180 190, 200 110, 250 130 C 300 148, 260 230, 180 210 C 110 192, 80 140, 70 100 C 65 82, 58 76, 50 70"
            stroke="#0E1220"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 78 87 L 50 70 L 58 103"
            stroke="#0E1220"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Card */}
      <div className="w-full max-w-[540px] text-center flex flex-col items-center relative z-[1]">
        {/* Brand pill */}
        <div className="inline-flex items-center gap-2.5 py-[7px] pr-3.5 pl-2.5 rounded-full bg-white border border-[#ECEDF2] text-[13px] font-medium text-[#2B3042] tracking-[-0.005em] mb-9">
          <span
            className="w-[22px] h-[22px] rounded-[6px] bg-[#2F5BFF] grid place-items-center text-white"
            aria-hidden="true"
          >
            <Mic size={13} strokeWidth={2.4} />
          </span>
          Varta
          <span className="w-1.5 h-1.5 rounded-full bg-[#0B8A5A] ml-0.5" />
          <span className="text-[#5A6075] font-normal">Microphone setup</span>
        </div>

        {/* Headline */}
        <h1 className="text-[40px] max-[680px]:text-[30px] max-[480px]:text-[24px] leading-[1.1] tracking-[-0.028em] font-semibold text-[#0E1220] mb-[18px] text-balance">
          Enable your microphone to{' '}
          <span
            className="italic font-normal text-[#2F5BFF] tracking-[-0.01em]"
            style={{ fontFamily: 'var(--font-instrument-serif), serif' }}
          >
            start transcribing
          </span>
          .
        </h1>

        {/* Lede */}
        <p className="text-[17px] max-[680px]:text-[15.5px] leading-[1.55] text-[#5A6075] mb-10 max-w-[440px] text-pretty">
          Your browser is showing a permission popup in the top-left corner. Click{' '}
          <strong className="font-semibold">Allow</strong> to let Varta listen during
          sessions.
        </p>

        {/* Hint pill */}
        <div className="inline-flex items-center gap-2.5 py-2.5 pr-4 pl-3.5 bg-white border border-[#ECEDF2] rounded-xl text-sm text-[#2B3042] mb-10 shadow-[0_1px_2px_rgba(14,18,32,0.03)]">
          <ArrowUpRight size={16} strokeWidth={2} className="text-[#858AA0]" />
          <span>In the popup, choose</span>
          <span className="inline-flex items-center py-[3px] px-[9px] rounded-[6px] bg-[#EEF2FF] text-[#2F5BFF] font-semibold text-[13px] tracking-[-0.005em]">
            Allow while visiting the site
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-[18px] text-[13px] text-[#858AA0] flex-wrap justify-center">
          <span>One-time setup</span>
          <span className="w-[3px] h-[3px] rounded-full bg-[#858AA0] opacity-50" />
          <span>Secure & encrypted</span>
          <span className="w-[3px] h-[3px] rounded-full bg-[#858AA0] opacity-50" />
          <a
            href="https://scribe.eka.care"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2F5BFF] font-medium no-underline inline-flex items-center gap-[5px] hover:text-[#1E46E0] group"
          >
            Explore Varta
            <ArrowUpRight
              size={11}
              strokeWidth={2.2}
              className="transition-transform duration-200 ease-out group-hover:translate-x-[2px] group-hover:-translate-y-[2px]"
            />
          </a>
        </div>
      </div>
    </main>
  );
};

export default MicPermissionScreen;
