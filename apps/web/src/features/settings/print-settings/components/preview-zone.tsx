'use client';

import { Upload } from 'lucide-react';

type PreviewZoneProps = {
  variant: 'header' | 'footer';
  image: string | null;
  heightCm: number;
  isUploadMode: boolean;
};

const PreviewZone = ({ variant, image, heightCm, isUploadMode }: PreviewZoneProps) => {
  const isHeader = variant === 'header';
  const borderSideClass = isHeader ? 'border-b' : 'border-t';

  if (image) {
    return (
      <div
        className={`w-full h-full overflow-hidden border-border ${borderSideClass} ${
          isHeader ? '' : 'flex items-end'
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
            objectPosition: isHeader ? 'top' : 'bottom',
          }}
        />
      </div>
    );
  }

  if (isUploadMode) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center gap-1 text-primary bg-primary/5 border-dashed border-primary/40 ${borderSideClass}`}
      >
        <Upload className="w-3 h-3" />
        <span className="text-[10px]">
          Upload your {variant} image
        </span>
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center bg-primary/5 border-dashed border-primary/40 text-primary ${borderSideClass}`}
    >
      <span className="text-[10px] font-medium">
        {isHeader ? 'Header' : 'Footer'} Space ({heightCm.toFixed(1)}cm)
      </span>
    </div>
  );
};

export default PreviewZone;
