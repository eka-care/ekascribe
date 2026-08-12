// The Figma CTA only ships the Apple mark; the Windows-first variant uses the
// standard four-pane glyph, drawn to the same 16px box.
export function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M0 2.27 6.53 1.38v6.31H0V2.27ZM7.33 1.27 16 0v7.62H7.33V1.27ZM0 8.48h6.53v6.32L0 13.9V8.48ZM7.33 8.48H16V16l-8.67-1.2V8.48Z" />
    </svg>
  );
}
