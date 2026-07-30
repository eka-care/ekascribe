import {
  A4_DIMENSIONS_CM,
  FOOTER_HEIGHT_RANGE_CM,
  HEADER_HEIGHT_RANGE_CM,
  SIMPLE_LAYOUT_DEFAULTS_CM,
} from '@/features/settings/print-settings/config/print-settings-config';
import type {
  PrintImageState,
  PrintSettingsState,
} from '@/features/settings/print-settings/hooks/use-print-settings';
import type { TPrintConfigSection } from '@/constants/types';
import { fetchUrlAsDataUrl } from '@/features/settings/print-settings/utils/image-crop';

type PrintConfigContentType =
  | 'image/jpeg'
  | 'image/jpg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

type PrintConfigUnit = 'cm' | 'mm';

type PrintConfigImageSection = {
  type: 'image';
  data: string;
  content_type: PrintConfigContentType;
  width: number;
  height: number;
  unit: PrintConfigUnit;
};

type PrintConfigMarginSection = {
  type: 'margin';
  width: number;
  height: number;
  unit: PrintConfigUnit;
};

type PrintConfigSection = PrintConfigImageSection | PrintConfigMarginSection;

export type PrintConfigPayload = {
  request_type: 'user';
  data: {
    header?: PrintConfigSection | null;
    footer?: PrintConfigSection | null;
  };
};

const CONTENT_TYPE_BY_MIME: Record<string, PrintConfigContentType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
};

function parseDataUrl(
  dataUrl: string
): { data: string; contentType: PrintConfigContentType } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  if (!match) return null;
  const contentType = CONTENT_TYPE_BY_MIME[match[1].toLowerCase()];
  if (!contentType) return null;
  return { data: match[2], contentType };
}

function cmToMm(cm: number): number {
  return Math.round(cm * 10);
}

// Returns:
//   null    — slot was removed; backend should clear it.
//   section — image data with current dimensions.
async function buildImageSection(
  image: PrintImageState,
  fallbackHeightCm: number
): Promise<PrintConfigSection | null> {
  const source = image.croppedImage ?? image.originalImage;
  if (!source) return null;

  let parsed = parseDataUrl(source);
  if (!parsed) {
    // Source is a CDN URL — fetch and convert so updated dimensions are sent.
    const dataUrl = await fetchUrlAsDataUrl(source);
    parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;
  }

  return {
    type: 'image',
    data: parsed.data,
    content_type: parsed.contentType,
    width: cmToMm(A4_DIMENSIONS_CM.width),
    height: cmToMm(image.heightCm || fallbackHeightCm),
    unit: 'mm',
  };
}

function buildMarginSection(heightCm: number): PrintConfigSection {
  return {
    type: 'margin',
    width: cmToMm(A4_DIMENSIONS_CM.width),
    height: cmToMm(heightCm),
    unit: 'mm',
  };
}

export async function buildPrintConfigPayload(
  state: PrintSettingsState
): Promise<PrintConfigPayload> {
  if (!state.enabled) {
    return { request_type: 'user', data: { header: null, footer: null } };
  }

  const data: PrintConfigPayload['data'] = {};

  if (state.activeTab === 'upload') {
    const [header, footer] = await Promise.all([
      buildImageSection(state.header, HEADER_HEIGHT_RANGE_CM.default),
      buildImageSection(state.footer, FOOTER_HEIGHT_RANGE_CM.default),
    ]);
    data.header = header;
    data.footer = footer;
  } else {
    data.header = buildMarginSection(state.simpleLayout.headerSpaceCm);
    data.footer = buildMarginSection(state.simpleLayout.footerSpaceCm);
  }

  return { request_type: 'user', data };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toCm(value: number, unit: 'cm' | 'mm'): number {
  return unit === 'mm' ? value / 10 : value;
}

function withCacheBuster(url: string): string {
  // CDN URLs are stable paths whose bytes change after each save. Append a
  // timestamp so the browser fetches a fresh copy after the user updates the
  // image, instead of showing the stale cached version.
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Date.now()}`;
}

function sectionToImageState(
  section: TPrintConfigSection | undefined,
  fallbackHeightCm: number,
  range: { min: number; max: number }
): PrintImageState {
  if (section?.type === 'image') {
    const src = withCacheBuster(section.url);
    return {
      originalImage: src,
      croppedImage: src,
      savedCrop: null,
      heightCm: clamp(toCm(section.height, section.unit), range.min, range.max),
    };
  }
  return {
    originalImage: null,
    croppedImage: null,
    savedCrop: null,
    heightCm: fallbackHeightCm,
  };
}

export function buildStateFromConfig(
  header: TPrintConfigSection | undefined,
  footer: TPrintConfigSection | undefined
): PrintSettingsState {
  const hasImage = header?.type === 'image' || footer?.type === 'image';
  const activeTab: PrintSettingsState['activeTab'] = hasImage ? 'upload' : 'simple-layout';

  const headerMarginCm =
    header?.type === 'margin' ? toCm(header.height, header.unit) : SIMPLE_LAYOUT_DEFAULTS_CM.header;
  const footerMarginCm =
    footer?.type === 'margin' ? toCm(footer.height, footer.unit) : SIMPLE_LAYOUT_DEFAULTS_CM.footer;

  return {
    enabled: true,
    activeTab,
    header: sectionToImageState(header, HEADER_HEIGHT_RANGE_CM.default, HEADER_HEIGHT_RANGE_CM),
    footer: sectionToImageState(footer, FOOTER_HEIGHT_RANGE_CM.default, FOOTER_HEIGHT_RANGE_CM),
    simpleLayout: {
      headerSpaceCm: headerMarginCm,
      footerSpaceCm: footerMarginCm,
    },
  };
}
