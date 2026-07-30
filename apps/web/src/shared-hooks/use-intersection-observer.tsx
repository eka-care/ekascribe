'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseIntersectionObserverOptions {
  onIntersect: () => void;
  enabled?: boolean;
  rootMargin?: string;
  threshold?: number;
  debounceMs?: number;
  root?: Element | null;
}

export const useIntersectionObserver = ({
  root = null,
  rootMargin = '50px',
  threshold = 0.1,
  onIntersect,
  enabled = true,
  debounceMs = 300,
}: UseIntersectionObserverOptions) => {
  const observerRef = useRef<HTMLDivElement>(null);
  const lastTriggerTime = useRef<number>(0);
  const observerInstance = useRef<IntersectionObserver | null>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];

      if (!entry.isIntersecting || !enabled) return;

      const now = Date.now();
      if (now - lastTriggerTime.current < debounceMs) return;
      lastTriggerTime.current = now;
      onIntersect();
    },
    [onIntersect, enabled, debounceMs]
  );

  useEffect(() => {
    if (!enabled) {
      if (observerInstance.current) {
        observerInstance.current.disconnect();
        observerInstance.current = null;
      }
      return;
    }

    observerInstance.current = new IntersectionObserver(handleIntersection, {
      root,
      rootMargin,
      threshold,
    });

    const currentElement = observerRef.current;
    if (currentElement && observerInstance.current) {
      observerInstance.current.observe(currentElement);
    }

    return () => {
      if (observerInstance.current) {
        observerInstance.current.disconnect();
        observerInstance.current = null;
      }
    };
  }, [handleIntersection, rootMargin, threshold, enabled]);

  return observerRef;
};
