import { MODEL_TYPE } from './enums';
import { TPreferenceItem } from './types';

const env = (process.env.NEXT_PUBLIC_ENV || 'PROD') as 'DEV' | 'PROD';

// Keep in sync with the backend's SUPPORTED_LANGUAGES (scribe/core/choices.py) —
// ids not known to the backend fail session creation.
export const SUPPORTED_LANGUAGES: TPreferenceItem[] = [
  { id: 'en', name: 'English' },
  { id: 'hi', name: 'Hindi' },
  { id: 'en-hi', name: 'English + Hindi' },
  { id: 'en-IN', name: 'English (India)' },
  { id: 'en-US', name: 'English (United States)' },
  { id: 'gu', name: 'Gujarati' },
  { id: 'kn', name: 'Kannada' },
  { id: 'ml', name: 'Malayalam' },
  { id: 'ta', name: 'Tamil' },
  { id: 'te', name: 'Telugu' },
  { id: 'bn', name: 'Bengali' },
  { id: 'mr', name: 'Marathi' },
  { id: 'pa', name: 'Punjabi' },
  { id: 'or', name: 'Oriya' },
  { id: 'as', name: 'Assamese' },
];

/** Lookup by id — never index positionally; list order is presentation, not meaning. */
export const findLanguage = (id: string): TPreferenceItem | undefined =>
  SUPPORTED_LANGUAGES.find((l) => l.id === id);

export const SUPPORTED_OUTPUT_FORMATS_PROD: TPreferenceItem[] = [
  {
    id: '9d9675c6-b29b-424a-abac-99ddd3b8909c',
    name: 'Notes',
    template_type: 'custom',
  },
];

export const SUPPORTED_OUTPUT_FORMATS_DEV: TPreferenceItem[] = [
  {
    id: '3d707c1c-311e-4424-80e9-e5d7a229d519',
    name: 'SOAP Notes',
    template_type: 'custom',
  },
];

export const SUPPORTED_OUTPUT_FORMATS =
  env === 'PROD' ? SUPPORTED_OUTPUT_FORMATS_PROD : SUPPORTED_OUTPUT_FORMATS_DEV;

export const CONSULTATION_MODES: TPreferenceItem[] = [
  {
    id: 'dictation',
    name: 'Dictation',
    desc: 'Dictate your notes and create structured notes',
  },
];

export const SUPPORTED_MODELS: TPreferenceItem[] = [
  {
    id: MODEL_TYPE.PRO,
    name: 'Pro',
    desc: 'Our best model, built for maximum accuracy, may take a little longer.',
  },
  {
    id: MODEL_TYPE.LITE,
    name: 'Lite',
    desc: 'Lightweight, faster results with balanced accuracy.',
  },
];

export const TRANSCRIPTION_LANGUAGES: TPreferenceItem[] = [
  { id: 'raw', name: 'Original' },
  { id: 'eng', name: 'English' },
  { id: 'hi', name: 'Hindi' },
  { id: 'gu', name: 'Gujarati' },
  { id: 'kn', name: 'Kannada' },
  { id: 'ml', name: 'Malayalam' },
  { id: 'ta', name: 'Tamil' },
  { id: 'te', name: 'Telugu' },
  { id: 'bn', name: 'Bengali' },
  { id: 'mr', name: 'Marathi' },
  { id: 'pa', name: 'Punjabi' },
];
