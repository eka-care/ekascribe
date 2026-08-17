import { VaartaLogoLottie } from '@/shared-components/vaarta-logo-lottie';

export function DownloadFooter() {
  return (
    <footer className="relative w-full border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-360 flex-col gap-8 px-4 pb-8 pt-12 md:px-8 xl:px-16">
        <div className="flex items-start justify-between pb-6">
          <VaartaLogoLottie width={310} height={74} />
        </div>
      </div>
    </footer>
  );
}
