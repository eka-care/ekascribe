export const A4_DIMENSIONS_CM = { width: 21, height: 29.7 } as const;

export const HEADER_HEIGHT_RANGE_CM = { min: 2, max: 8, default: 6, step: 0.1 } as const;
export const FOOTER_HEIGHT_RANGE_CM = { min: 1.5, max: 8, default: 3, step: 0.1 } as const;

export const SIMPLE_LAYOUT_RANGE_CM = { min: 1, max: 10, step: 0.5 } as const;
export const SIMPLE_LAYOUT_DEFAULTS_CM = { header: 4, footer: 3 } as const;

export const RECOMMENDED_HEADER_RATIO = 6.2;
export const RECOMMENDED_FOOTER_RATIO = 6.2;

export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/jpg';
export const MAX_IMAGE_SIZE_MB = 5;

export const SIMPLE_LAYOUT_PRESETS = [
  { id: 'compact', label: 'Compact', header: 2, footer: 1.5 },
  { id: 'standard', label: 'Standard', header: 4, footer: 3 },
  { id: 'large', label: 'Large', header: 6, footer: 4 },
] as const;

export const UPLOAD_TIPS = [
  'Use high resolution images (300 DPI) for crisp print',
  'Header: 2480 × 708 px • Footer: 2480 × 354 px',
  'A4 page width is 21 cm',
];

export const SIMPLE_LAYOUT_INFO =
  'Use Simple Layout Control when you have pre-printed letterheads with clinic branding already on the paper.';
