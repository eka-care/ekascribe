// Self-hosted fonts (on-prem: no Google Fonts fetch at build time). The public
// download page is designed in Inter — including Light (300) for the hero
// headline — while the app shell runs on Geist.
import localFont from 'next/font/local';

const inter = localFont({
  src: [
    { path: '../../fonts/inter-latin-300-normal.woff2', weight: '300' },
    { path: '../../fonts/inter-latin-400-normal.woff2', weight: '400' },
    { path: '../../fonts/inter-latin-500-normal.woff2', weight: '500' },
    { path: '../../fonts/inter-latin-600-normal.woff2', weight: '600' },
    { path: '../../fonts/inter-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-inter',
});

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.variable} ${inter.className} min-h-full w-full`}>{children}</div>;
}
