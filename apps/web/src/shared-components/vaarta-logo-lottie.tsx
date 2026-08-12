'use client';

import dynamic from 'next/dynamic';

// dotLottie renders via a WASM engine that is normally fetched from a CDN —
// unreachable on air-gapped deployments, so point it at our own copy
// (public/assets/dotlottie-player.wasm). Client-only: the player needs the DOM.
const Player = dynamic(
  async () => {
    const [{ DotLottieReact }, { DotLottie }] = await Promise.all([
      import('@lottiefiles/dotlottie-react'),
      import('@lottiefiles/dotlottie-web'),
    ]);
    DotLottie.setWasmUrl('/assets/dotlottie-player.wasm');
    return { default: DotLottieReact };
  },
  { ssr: false }
);

// Animated vaarta lockup (logo + wordmark + "powered by @eka.care"), 300x72 asset.
export function VaartaLogoLottie({ className }: { className?: string }) {
  return (
    <div className={className} style={{ width: 170, height: 41 }}>
      <Player src="/assets/vaarta-logo.lottie" loop autoplay />
    </div>
  );
}
