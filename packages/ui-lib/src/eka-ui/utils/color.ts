const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

const SHADE_ADJUSTMENTS: Record<string, number> = {
  '--color-primary-100': 0.35,
  '--color-primary-200': 0.25,
  '--color-primary-300': 0.15,
  '--color-primary-400': 0.08,
  '--color-primary-500': 0,
  '--color-primary-600': -0.05,
  '--color-primary-700': -0.15,
  '--color-primary-800': -0.25,
  '--color-primary-900': -0.35,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(color: string | undefined) {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (!HEX_PATTERN.test(trimmed)) return undefined;
  return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / delta) % 6;
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2;
        break;
      default:
        h = (rNorm - gNorm) / delta + 4;
        break;
    }
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (h >= 60 && h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (h >= 120 && h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (h >= 180 && h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);

  return `#${[r, g, b]
    .map((value) => {
      const hex = value.toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    })
    .join('')}`;
}

function adjustLightness(hex: string, delta: number) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const adjusted = clamp(l + delta);
  return hslToHex(h, s, adjusted);
}

function getContrastingTextColor(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0d1f24' : '#ffffff';
}

function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type GeneratedPalette = Record<string, string>;

export function generatePrimaryPalette(baseColor?: string): GeneratedPalette | undefined {
  const normalized = normalizeHex(baseColor);
  if (!normalized) return undefined;

  const palette: GeneratedPalette = {};
  Object.entries(SHADE_ADJUSTMENTS).forEach(([token, delta]) => {
    palette[token] = adjustLightness(normalized, delta);
  });

  // Set base primary color tokens
  palette['--color-primary'] = palette['--color-primary-500'];
  palette['--color-primary-foreground'] = getContrastingTextColor(palette['--color-primary']);

  // Generate semantic tokens that the client theme expects
  palette['--color-primary-background-default'] = palette['--color-primary-500'];
  palette['--color-foreground-on-primary'] = getContrastingTextColor(
    palette['--color-primary-500']
  );
  palette['--color-foreground-primary-default'] = palette['--color-primary-700'];
  // Use primary color with 28% opacity for subtle background
  palette['--color-background-primary-default'] = hexToRgba(normalized, 0.04);
  palette['--color-background-primary-subtle'] = hexToRgba(normalized, 0.28);
  palette['--color-background-primary-strong'] = palette['--color-primary-300'];
  palette['--color-border-primary-ring'] = palette['--color-primary-500'];

  return palette;
}
