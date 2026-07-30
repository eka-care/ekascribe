'use client';

import { useState } from 'react';
import { Info, Lightbulb } from 'lucide-react';
import ImageUploadCard from './image-upload-card';
import LabeledRangeSlider from './labeled-range-slider';
import CropImageDialog from './crop-image-dialog';
import {
  A4_DIMENSIONS_CM,
  HEADER_HEIGHT_RANGE_CM,
  FOOTER_HEIGHT_RANGE_CM,
  RECOMMENDED_HEADER_RATIO,
  RECOMMENDED_FOOTER_RATIO,
  UPLOAD_TIPS,
} from '@/features/settings/print-settings/config/print-settings-config';
import type {
  PercentCropValue,
  PrintImageState,
} from '@/features/settings/print-settings/hooks/use-print-settings';
import { getImageDimensions } from '@/features/settings/print-settings/utils/image-crop';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function heightCmFromAspect(
  dataUrl: string,
  range: { min: number; max: number; step: number },
  fallbackCm: number
): Promise<number> {
  try {
    const { width, height } = await getImageDimensions(dataUrl);
    if (!width || !height) return fallbackCm;
    const rawCm = (A4_DIMENSIONS_CM.width * height) / width;
    const stepped = Math.round(rawCm / range.step) * range.step;
    return clamp(Number(stepped.toFixed(2)), range.min, range.max);
  } catch {
    return fallbackCm;
  }
}

type UploadHeaderFooterTabProps = {
  header: PrintImageState;
  footer: PrintImageState;
  onHeaderChange: (updater: (prev: PrintImageState) => PrintImageState) => void;
  onFooterChange: (updater: (prev: PrintImageState) => PrintImageState) => void;
};

const UploadHeaderFooterTab = ({
  header,
  footer,
  onHeaderChange,
  onFooterChange,
}: UploadHeaderFooterTabProps) => {
  const [cropTarget, setCropTarget] = useState<'header' | 'footer' | null>(null);

  const cropImage =
    cropTarget === 'header'
      ? header.originalImage
      : cropTarget === 'footer'
      ? footer.originalImage
      : null;

  const cropRatio =
    cropTarget === 'header' ? RECOMMENDED_HEADER_RATIO : RECOMMENDED_FOOTER_RATIO;

  const initialCrop =
    cropTarget === 'header'
      ? header.savedCrop
      : cropTarget === 'footer'
      ? footer.savedCrop
      : null;

  const handleApplyCrop = async (dataUrl: string, percentCrop: PercentCropValue) => {
    const target = cropTarget;
    setCropTarget(null);
    if (target === 'header') {
      const nextHeight = await heightCmFromAspect(
        dataUrl,
        HEADER_HEIGHT_RANGE_CM,
        header.heightCm
      );
      onHeaderChange((prev) => ({
        ...prev,
        croppedImage: dataUrl,
        savedCrop: percentCrop,
        heightCm: nextHeight,
      }));
    } else if (target === 'footer') {
      const nextHeight = await heightCmFromAspect(
        dataUrl,
        FOOTER_HEIGHT_RANGE_CM,
        footer.heightCm
      );
      onFooterChange((prev) => ({
        ...prev,
        croppedImage: dataUrl,
        savedCrop: percentCrop,
        heightCm: nextHeight,
      }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-primary">A4 Page Configuration</p>
          <p className="text-xs text-[#767676]">
            Upload custom header & footer images. Applied to all prescriptions.
          </p>
        </div>
      </div>

      <ImageUploadCard
        title="Header Image"
        variant="header"
        image={header.croppedImage ?? header.originalImage}
        heightCm={header.heightCm}
        emptyLabel="Click to upload header"
        heightSlider={
          <LabeledRangeSlider
            label="Header Height"
            value={Number(header.heightCm.toFixed(1))}
            min={HEADER_HEIGHT_RANGE_CM.min}
            max={HEADER_HEIGHT_RANGE_CM.max}
            step={HEADER_HEIGHT_RANGE_CM.step}
            onChange={(v) => onHeaderChange((prev) => ({ ...prev, heightCm: v }))}
          />
        }
        onImageSelected={async (dataUrl) => {
          const nextHeight = await heightCmFromAspect(
            dataUrl,
            HEADER_HEIGHT_RANGE_CM,
            header.heightCm
          );
          onHeaderChange(() => ({
            originalImage: dataUrl,
            croppedImage: null,
            savedCrop: null,
            heightCm: nextHeight,
          }));
        }}
        onRemove={() =>
          onHeaderChange(() => ({
            originalImage: null,
            croppedImage: null,
            savedCrop: null,
            heightCm: header.heightCm,
          }))
        }
        onCrop={() => setCropTarget('header')}
      />

      <ImageUploadCard
        title="Footer Image"
        variant="footer"
        image={footer.croppedImage ?? footer.originalImage}
        heightCm={footer.heightCm}
        emptyLabel="Click to upload footer"
        heightSlider={
          <LabeledRangeSlider
            label="Footer Height"
            value={Number(footer.heightCm.toFixed(1))}
            min={FOOTER_HEIGHT_RANGE_CM.min}
            max={FOOTER_HEIGHT_RANGE_CM.max}
            step={FOOTER_HEIGHT_RANGE_CM.step}
            onChange={(v) => onFooterChange((prev) => ({ ...prev, heightCm: v }))}
          />
        }
        onImageSelected={async (dataUrl) => {
          const nextHeight = await heightCmFromAspect(
            dataUrl,
            FOOTER_HEIGHT_RANGE_CM,
            footer.heightCm
          );
          onFooterChange(() => ({
            originalImage: dataUrl,
            croppedImage: null,
            savedCrop: null,
            heightCm: nextHeight,
          }));
        }}
        onRemove={() =>
          onFooterChange(() => ({
            originalImage: null,
            croppedImage: null,
            savedCrop: null,
            heightCm: footer.heightCm,
          }))
        }
        onCrop={() => setCropTarget('footer')}
      />

      <div className="border border-border rounded-lg p-3 bg-muted/40">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <p className="text-sm font-medium">Tips for best results</p>
        </div>
        <ul className="text-xs text-[#767676] space-y-1 list-disc pl-5">
          {UPLOAD_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>

      <CropImageDialog
        open={cropTarget !== null}
        onOpenChange={(open) => !open && setCropTarget(null)}
        image={cropImage}
        recommendedAspectRatio={cropRatio}
        initialCrop={initialCrop}
        onApply={handleApplyCrop}
      />
    </div>
  );
};

export default UploadHeaderFooterTab;
