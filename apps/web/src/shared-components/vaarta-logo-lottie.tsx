'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// lottie-web touches the DOM at import time — keep it out of the prerender.
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

// Animated vaarta lockup (logo + wordmark + "powered by @eka.care"), 170x44.
// The JSON lives in public/ so it stays out of the JS bundle and caches
// independently.
export function VaartaLogoLottie({ className }: { className?: string }) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/assets/vaarta-logo-lottie.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setAnimationData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!animationData) {
    // Keep the header height stable while the animation loads.
    return <div className={className} style={{ width: 170, height: 44 }} />;
  }

  return (
    <Lottie
      animationData={animationData}
      loop
      autoplay
      className={className}
      style={{ width: 170, height: 44 }}
    />
  );
}
