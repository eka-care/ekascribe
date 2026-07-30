'use client';

import { A4_DIMENSIONS_CM } from '@/features/settings/print-settings/config/print-settings-config';
import type { PrintSettingsState } from '@/features/settings/print-settings/hooks/use-print-settings';
import PreviewZone from './preview-zone';

type A4PreviewProps = {
  state: PrintSettingsState;
};

const A4_MAX_WIDTH_PX = 380;
const ASPECT_RATIO = `${A4_DIMENSIONS_CM.width} / ${A4_DIMENSIONS_CM.height}`;
const heightPct = (cm: number) => (cm / A4_DIMENSIONS_CM.height) * 100;

const PrescriptionBody = () => (
  <>
    <div className="flex justify-between border-b border-border pb-1 mb-2">
      <span>
        <span className="font-semibold">Patient:</span> John Doe |{' '}
        <span className="font-semibold">Age:</span> 35Y |{' '}
        <span className="font-semibold">Sex:</span> M
      </span>
      <span>
        <span className="font-semibold">Date:</span> 14/5/2026
      </span>
    </div>
    <div className="flex gap-2">
      <span className="text-base font-serif italic">℞</span>
      <ol className="space-y-1.5">
        <li>
          <p className="font-medium">1. Tab. Paracetamol 500mg</p>
          <p className="text-[#767676] pl-3">1-0-1 × 5 days (After food)</p>
        </li>
        <li>
          <p className="font-medium">2. Cap. Omeprazole 20mg</p>
          <p className="text-[#767676] pl-3">1-0-0 × 7 days (Before food)</p>
        </li>
        <li>
          <p className="font-medium">3. Syp. Ascoril LS</p>
          <p className="text-[#767676] pl-3">2 tsp - TID × 5 days</p>
        </li>
        <li>
          <p className="font-medium">4. Tab. Cetirizine 10mg</p>
          <p className="text-[#767676] pl-3">0-0-1 × 5 days (At bedtime)</p>
        </li>
      </ol>
    </div>
    <div className="mt-3 bg-primary/5 border border-primary/20 rounded p-2 text-[9px]">
      <p className="font-medium text-primary">Advice:</p>
      <ul className="text-[#767676] space-y-0.5 list-disc pl-4 mt-1">
        <li>Drink plenty of fluids</li>
        <li>Adequate rest</li>
        <li>Follow up after 5 days</li>
      </ul>
    </div>
  </>
);

const A4Preview = ({ state }: A4PreviewProps) => {
  const isEnabled = state.enabled;
  const isUploadMode = state.activeTab === 'upload';

  const headerImage = isEnabled && isUploadMode
    ? state.header.croppedImage ?? state.header.originalImage
    : null;
  const footerImage = isEnabled && isUploadMode
    ? state.footer.croppedImage ?? state.footer.originalImage
    : null;

  const headerHeightCm = isEnabled
    ? isUploadMode
      ? state.header.heightCm
      : state.simpleLayout.headerSpaceCm
    : 0;
  const footerHeightCm = isEnabled
    ? isUploadMode
      ? state.footer.heightCm
      : state.simpleLayout.footerSpaceCm
    : 0;

  const headerTopPct = 0;
  const headerBottomPct = 100 - heightPct(headerHeightCm);
  const footerTopPct = 100 - heightPct(footerHeightCm);
  const footerBottomPct = 0;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-3 text-xs text-[#767676]">
        <span className="bg-muted rounded-md px-2 py-1 font-medium text-foreground">
          A4 Preview
        </span>
        <span>
          {A4_DIMENSIONS_CM.width} × {A4_DIMENSIONS_CM.height} cm
        </span>
      </div>

      <div
        className="bg-white shadow-xl relative overflow-hidden rounded-md w-full"
        style={{
          maxWidth: A4_MAX_WIDTH_PX,
          aspectRatio: ASPECT_RATIO,
        }}
      >
        <div
          className="absolute left-0 right-0"
          style={{ top: `${headerTopPct}%`, bottom: `${headerBottomPct}%` }}
        >
          {isEnabled && (
            <PreviewZone
              variant="header"
              image={headerImage}
              heightCm={headerHeightCm}
              isUploadMode={isUploadMode}
            />
          )}
        </div>

        <div
          className="absolute left-0 right-0 px-3 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] text-foreground overflow-hidden"
          style={{
            top: `${heightPct(headerHeightCm)}%`,
            bottom: `${heightPct(footerHeightCm)}%`,
          }}
        >
          <PrescriptionBody />
        </div>

        <div
          className="absolute left-0 right-0"
          style={{ top: `${footerTopPct}%`, bottom: `${footerBottomPct}%` }}
        >
          {isEnabled && (
            <PreviewZone
              variant="footer"
              image={footerImage}
              heightCm={footerHeightCm}
              isUploadMode={isUploadMode}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default A4Preview;
