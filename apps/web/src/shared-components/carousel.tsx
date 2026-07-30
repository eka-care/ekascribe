'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';

const TRANSITION_MS = 500;

interface CarouselProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  autoRotateMs?: number;
  pauseOnHover?: boolean;
  showControls?: boolean;
  className?: string;
}

const Carousel = <T,>({
  items,
  renderItem,
  autoRotateMs = 5000,
  pauseOnHover = true,
  showControls = true,
  className = '',
}: CarouselProps<T>) => {
  const itemCount = items.length;
  const trackItems = useMemo(
    () => (itemCount === 0 ? [] : [items[itemCount - 1], ...items, items[0]]),
    [items, itemCount]
  );

  const [trackIdx, setTrackIdx] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    if (!autoRotateMs || itemCount < 2 || (pauseOnHover && isHovering)) return;
    const interval = setInterval(() => {
      setAnimate(true);
      setTrackIdx((i) => i + 1);
    }, autoRotateMs);
    return () => clearInterval(interval);
  }, [autoRotateMs, itemCount, pauseOnHover, isHovering, trackIdx]);

  useEffect(() => {
    if (itemCount < 2) return;
    if (trackIdx === itemCount + 1) {
      const t = setTimeout(() => {
        setAnimate(false);
        setTrackIdx(1);
      }, TRANSITION_MS);
      return () => clearTimeout(t);
    }
    if (trackIdx === 0) {
      const t = setTimeout(() => {
        setAnimate(false);
        setTrackIdx(itemCount);
      }, TRANSITION_MS);
      return () => clearTimeout(t);
    }
  }, [trackIdx, itemCount]);

  useEffect(() => {
    if (animate) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimate(true));
    });
    return () => cancelAnimationFrame(id);
  }, [animate]);

  const goToPrev = () => {
    if (!animate) return;
    setTrackIdx((i) => i - 1);
  };
  const goToNext = () => {
    if (!animate) return;
    setTrackIdx((i) => i + 1);
  };

  const realActiveIdx = useMemo(() => {
    if (itemCount === 0) return 0;
    if (trackIdx === 0) return itemCount - 1;
    if (trackIdx === itemCount + 1) return 0;
    return trackIdx - 1;
  }, [trackIdx, itemCount]);

  return (
    <div className={`flex flex-col gap-3 items-center w-full ${className}`}>
      <div
        onMouseEnter={() => pauseOnHover && setIsHovering(true)}
        onMouseLeave={() => pauseOnHover && setIsHovering(false)}
        className="relative w-full overflow-hidden"
      >
        <div
          className={`flex gap-4 ${animate ? 'transition-transform duration-500 ease-out' : ''}`}
          style={{ transform: `translateX(calc(-${trackIdx} * (100% + 16px)))` }}
        >
          {trackItems.map((item, i) => (
            <div key={i} aria-hidden={i !== trackIdx} className="w-full shrink-0">
              {renderItem(item, i)}
            </div>
          ))}
        </div>
      </div>

      {showControls && itemCount > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrev}
            aria-label="Previous"
            className="size-10 flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground rounded-full"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex items-center gap-1">
            {items.map((_, i) => (
              <span
                key={i}
                aria-current={i === realActiveIdx ? 'true' : undefined}
                className={`size-1.5 rounded-full transition-colors duration-300 ${
                  i === realActiveIdx ? 'bg-primary' : 'bg-[#ededed]'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={goToNext}
            aria-label="Next"
            className="size-10 flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground rounded-full"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Carousel;
