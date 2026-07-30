'use client';

import { useRef } from 'react';
import { Button } from '@ui/src';
import { Upload, Crop, RefreshCw, X } from 'lucide-react';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_MB,
} from '@/features/settings/print-settings/config/print-settings-config';
import { readFileAsDataUrl } from '@/features/settings/print-settings/utils/image-crop';
import { toast } from 'sonner';

type ImageUploadCardProps = {
  title: string;
  variant: 'header' | 'footer';
  image: string | null;
  heightCm?: number;
  emptyLabel: string;
  heightSlider?: React.ReactNode;
  onImageSelected: (dataUrl: string) => void;
  onRemove: () => void;
  onCrop: () => void;
};

const ImageUploadCard = ({
  title,
  variant,
  image,
  emptyLabel,
  heightSlider,
  onImageSelected,
  onRemove,
  onCrop,
}: ImageUploadCardProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePickFile = () => inputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be under ${MAX_IMAGE_SIZE_MB}MB`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onImageSelected(dataUrl);
    } catch {
      toast.error('Could not read image file');
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <div className="bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
        {title}
      </div>

      <div className="p-4 flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="hidden"
          onChange={handleFileChange}
        />

        {image ? (
          <>
            <div
              className={`relative border border-border bg-muted h-32 overflow-hidden rounded-[10px] flex ${
                variant === 'footer' ? 'items-end' : 'items-start'
              }`}
            >
              <img
                src={image}
                alt={`${variant} preview`}
                className="block"
                style={{
                  width: '100%',
                  height: 'auto',
                  minHeight: '100%',
                  objectFit: 'cover',
                  objectPosition: variant === 'footer' ? 'bottom' : 'top',
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs cursor-pointer"
                  onClick={onCrop}
                >
                  <Crop className="w-3 h-3 mr-1" /> Crop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs cursor-pointer"
                  onClick={handlePickFile}
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Change
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive cursor-pointer"
                onClick={onRemove}
              >
                <X className="w-3 h-3 mr-1" /> Remove
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={handlePickFile}
            className="w-full border-2 border-dashed border-border rounded-md py-10 flex flex-col items-center justify-center gap-2 hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <div className="rounded-full bg-muted p-2">
              <Upload className="w-5 h-5 text-[#767676]" />
            </div>
            <p className="text-sm font-medium">{emptyLabel}</p>
            <p className="text-xs text-center text-[#767676]">
              PNG, JPG, JPEG up to {MAX_IMAGE_SIZE_MB}MB
            </p>
          </button>
        )}

        {heightSlider && <div className="pt-1">{heightSlider}</div>}
      </div>
    </div>
  );
};

export default ImageUploadCard;
