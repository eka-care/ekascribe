import { DEMO_VIDEO_POSTER, DEMO_VIDEO_SRC } from '../constants';

// The Figma frame is 1311 x 819 — a 16:10 box spanning the 1312px content column.
export function DemoVideo() {
  return (
    <section className="relative mx-auto w-full max-w-[1440px] px-4 md:px-8 xl:px-16">
      <div className="aspect-[1311/819] w-full overflow-hidden rounded-3xl border border-border bg-background">
        <video
          className="size-full object-cover"
          poster={DEMO_VIDEO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        >
          <source src={DEMO_VIDEO_SRC} type="video/mp4" />
        </video>
      </div>
    </section>
  );
}
