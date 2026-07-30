'use client';

import { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/src';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { applyCrop } from '@/features/settings/print-settings/utils/image-crop';
import { toast } from 'sonner';

type PercentCropValue = {
  unit: '%';
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropImageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: string | null;
  recommendedAspectRatio: number;
  initialCrop?: PercentCropValue | null;
  onApply: (croppedDataUrl: string, percentCrop: PercentCropValue) => void;
};

const buildCenteredCrop = (width: number, height: number, aspect?: number): Crop => {
  if (!aspect) {
    return { unit: '%', x: 0, y: 0, width: 100, height: 100 };
  }
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 100 }, aspect, width, height),
    width,
    height
  );
};

const CropImageDialog = ({
  open,
  onOpenChange,
  image,
  recommendedAspectRatio,
  initialCrop,
  onApply,
}: CropImageDialogProps) => {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const [lockRatio, setLockRatio] = useState(false);

  const toPixelCrop = (percentCrop: Crop, width: number, height: number): PixelCrop => ({
    unit: 'px',
    x: (percentCrop.x / 100) * width,
    y: (percentCrop.y / 100) * height,
    width: (percentCrop.width / 100) * width,
    height: (percentCrop.height / 100) * height,
  });

  const toPercentCrop = (
    pixelCrop: PixelCrop,
    width: number,
    height: number
  ): PercentCropValue => ({
    unit: '%',
    x: (pixelCrop.x / width) * 100,
    y: (pixelCrop.y / height) * 100,
    width: (pixelCrop.width / width) * 100,
    height: (pixelCrop.height / height) * 100,
  });

  const applyDefaultCrop = (width: number, height: number, aspect?: number) => {
    const next = buildCenteredCrop(width, height, aspect);
    setCrop(next);
    setCompletedCrop(toPixelCrop(next, width, height));
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (initialCrop) {
      setCrop(initialCrop);
      setCompletedCrop(toPixelCrop(initialCrop, width, height));
      return;
    }
    applyDefaultCrop(width, height, lockRatio ? recommendedAspectRatio : undefined);
  };

  const handleLockChange = (checked: boolean) => {
    setLockRatio(checked);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      applyDefaultCrop(width, height, checked ? recommendedAspectRatio : undefined);
    }
  };

  const handleApply = async () => {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      toast.error('Select a crop area first');
      return;
    }
    try {
      const dataUrl = await applyCrop(imgRef.current, completedCrop);
      const percent = toPercentCrop(
        completedCrop,
        imgRef.current.width,
        imgRef.current.height
      );
      onApply(dataUrl, percent);
      onOpenChange(false);
    } catch (err) {
      console.log('Crop error', err);
      const isSecurityError = err instanceof DOMException && err.name === 'SecurityError';
      toast.error(
        isSecurityError
          ? 'Cannot crop this image. Use Change to re-upload.'
          : 'Could not crop image'
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl w-[93vw] border-none pb-4">
        <DialogHeader className="m-0 space-y-0">
          <DialogTitle className="absolute top-4 left-4 sm:left-6 leading-none text-base sm:text-lg">
            Crop image
          </DialogTitle>
          <label className="absolute top-4 right-10 sm:right-12 flex items-center gap-2 text-xs sm:text-sm font-normal text-[#767676] cursor-pointer leading-none">
            <input
              type="checkbox"
              checked={lockRatio}
              onChange={(e) => handleLockChange(e.target.checked)}
              className="size-4 accent-primary cursor-pointer"
            />
            <span className="hidden sm:inline">
              Lock to recommended ratio ({recommendedAspectRatio.toFixed(2)}:1)
            </span>
            <span className="sm:hidden">Lock ratio</span>
          </label>
        </DialogHeader>

        <div className="-mx-6 border-b border-border pt-2" />

        <div className="flex items-start justify-center rounded-md p-2 max-h-[78vh] overflow-y-auto">
          {image && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={lockRatio ? recommendedAspectRatio : undefined}
              keepSelection
            >
              <img
                ref={imgRef}
                src={image}
                alt="To crop"
                crossOrigin="anonymous"
                onLoad={handleImageLoad}
                className="max-h-[70vh] w-auto"
              />
            </ReactCrop>
          )}
        </div>

        <DialogFooter className="border-t border-border -mx-6 px-6 pt-4">
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="cursor-pointer" onClick={handleApply}>
            Apply crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CropImageDialog;
