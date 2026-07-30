// Self-hosted fonts (on-prem: no Google Fonts fetch at build time)
import localFont from 'next/font/local';

const inter = localFont({
  src: [
    { path: '../../fonts/inter-latin-400-normal.woff2', weight: '400' },
    { path: '../../fonts/inter-latin-500-normal.woff2', weight: '500' },
    { path: '../../fonts/inter-latin-600-normal.woff2', weight: '600' },
    { path: '../../fonts/inter-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-inter',
});

const instrumentSerif = localFont({
  src: '../../fonts/instrument-serif-latin-400-italic.woff2',
  weight: '400',
  style: 'italic',
  variable: '--font-instrument-serif',
});

export default function MicPermissionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${instrumentSerif.variable} ${inter.className} min-h-full w-full`}>
      {children}
    </div>
  );
}
