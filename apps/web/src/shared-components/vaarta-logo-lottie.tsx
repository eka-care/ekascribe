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

// Animated vaarta lockup (logo + wordmark + "powered by @eka.care"), 200x50 by
// default; the public download page renders it larger in the nav and footer.
export function VaartaLogoLottie({
  className,
  width = 200,
  height = 50,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  return (
    <div className={className} style={{ width, height }}>
      <Player src="/assets/vaarta-logo.lottie" loop autoplay />
    </div>
  );
}
