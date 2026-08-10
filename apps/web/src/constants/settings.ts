import { MODEL_TYPE } from './enums';
import { TPreferenceItem } from './types';

const env = (process.env.NEXT_PUBLIC_ENV || 'PROD') as 'DEV' | 'PROD';

export const SUPPORTED_LANGUAGES: TPreferenceItem[] = [
  { id: 'en-IN', name: 'English (India)' },
  { id: 'en-US', name: 'English (United States)' },
  { id: 'hi', name: 'Hindi' },
  { id: 'gu', name: 'Gujarati' },
  { id: 'kn', name: 'Kannada' },
  { id: 'ml', name: 'Malayalam' },
  { id: 'ta', name: 'Tamil' },
  { id: 'te', name: 'Telugu' },
  { id: 'bn', name: 'Bengali' },
  { id: 'mr', name: 'Marathi' },
  { id: 'pa', name: 'Punjabi' },
  { id: 'as', name: 'Assamese' },
  { id: 'auto_detect', name: 'Auto Detect Language' },
];

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
