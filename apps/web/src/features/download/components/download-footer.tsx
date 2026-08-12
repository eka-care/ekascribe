import { VaartaLogoLottie } from '@/shared-components/vaarta-logo-lottie';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants';

export function DownloadFooter() {
  return (
    <footer className="relative w-full border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 pb-8 pt-12 md:px-8 xl:px-16">
        <div className="flex items-start justify-between pb-6">
          <VaartaLogoLottie width={310} height={74} />
        </div>

        <div className="h-px w-full bg-border" />

        <div className="flex flex-col gap-4 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Orbi Health Private Limited. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href={PRIVACY_POLICY_URL} className="hover:underline">
              Privacy Policy
            </a>
            <a href={TERMS_OF_SERVICE_URL} className="hover:underline">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
