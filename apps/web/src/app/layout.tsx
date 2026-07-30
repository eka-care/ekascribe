import { Suspense } from 'react';
import type { Metadata } from 'next';
// Self-hosted fonts (on-prem: no Google Fonts fetch at build time)
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ThemeProvider } from '@ui/src';
import ScreenContainer from '@/shared-components/screen-container';
import ProtectedRouteProvider from '@/provider/protected-route-provider';
import { ToastWrapper } from '@/shared-components/toast-wrapper';
import ErrorBoundaryProvider from '@/provider/error-boundary-provider';
import QueryClientRootProvider from '@/provider/query-client-provider';
import SecretsProvider from '@/provider/secrets-provider';
import Script from 'next/script';
import CrispUserSync from '@/shared-components/crisp-user-sync';
import OfflineIndicator from '@/shared-components/offline-indicator';
import TrayAppointmentSender from '@/features/tray-appointments/components/tray-appointment-sender';
import PrescriptionConsoleBindings from '@/features/prescription-whatsapp/dev/console-bindings';
import { PlatformProvider, DesktopOnly } from '@/platform';
import DesktopAuthBootstrap from '@/provider/desktop-auth-bootstrap';

const geistSans = { variable: GeistSans.variable };
const geistMono = { variable: GeistMono.variable };

export const metadata: Metadata = {
  title: 'ekascribe.ai',
  description: 'ekascribe.ai - AI-powered voice transcription for healthcare',
  other: {
    'apple-itunes-app': 'app-id=6756741683',
  },
};

// root layout which will wrap all the pages inside app.tsx, u can create specific layout for each page
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Google Tag Manager — opt-in for on-prem (NEXT_PUBLIC_ENABLE_GTM + id) */}
        {process.env.NEXT_PUBLIC_ENABLE_GTM === 'true' && process.env.NEXT_PUBLIC_GTM_ID && (
          <Script
            id="gtm-script"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID}');
              `,
            }}
          />
        )}
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Google Tag Manager (noscript) */}
        {process.env.NEXT_PUBLIC_ENABLE_GTM === 'true' && process.env.NEXT_PUBLIC_GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}

        <ErrorBoundaryProvider>
          <SecretsProvider>
            <QueryClientRootProvider>
              <ThemeProvider defaultTheme="doctor-light">
                <PlatformProvider>
                  <DesktopAuthBootstrap>
                    <Suspense>
                      <ScreenContainer>
                        <ProtectedRouteProvider>{children}</ProtectedRouteProvider>
                      </ScreenContainer>
                    </Suspense>
                  </DesktopAuthBootstrap>
                  <DesktopOnly>
                    <TrayAppointmentSender />
                    <PrescriptionConsoleBindings />
                  </DesktopOnly>
                  <ToastWrapper />
                  <OfflineIndicator />
                  <CrispUserSync />
                </PlatformProvider>
              </ThemeProvider>
            </QueryClientRootProvider>
          </SecretsProvider>
        </ErrorBoundaryProvider>

        {/* Crisp Chat Widget — opt-in for on-prem */}
        {process.env.NEXT_PUBLIC_ENABLE_CRISP === 'true' && process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID && (
          <Script
            id="crisp-chat"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.$crisp=[];
                window.CRISP_WEBSITE_ID="${process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID}";
                window.$crisp.push(["safe", true]);
                window.$crisp.push(["do", "chat:hide"]);
                window.$crisp.push(["on", "chat:closed", function(){ window.$crisp.push(["do", "chat:hide"]); }]);
                (function(){
                  d=document;
                  s=d.createElement("script");
                  s.src="https://client.crisp.chat/l.js";
                  s.async=1;
                  d.getElementsByTagName("head")[0].appendChild(s);
                })();
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}
