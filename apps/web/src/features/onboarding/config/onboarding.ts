import { SUPPORTED_LANGUAGES } from '@/constants/settings';
import { SuggestedPill } from '../components/preferences-pills';

export type Testimonial = {
  quote: string;
  name: string;
  title: string;
  photo: string;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      '“Varta has been a game-changer for our practice. It captures complete consultations accurately, even across English and regional languages.”',
    name: 'Dr. Nemichandra S.C.',
    title: 'Neurologist · Mysore',
    photo: 'https://cdn.eka.care/vagus/cmp0szlw600000thy61g1cmtu.png',
  },
  {
    quote:
      '“I love how quick and effortless Varta makes prescription writing. No more typing... It honestly feels like I’ve got a smart assistant sitting beside me.”',
    name: 'Dr. Kiran K.K.',
    title: 'Nephrologist · Mysore',
    photo: 'https://cdn.eka.care/vagus/cmp0sxiak00010tf06g4n34z8.png',
  },
  {
    quote:
      '“It’s a complete game-changer. It has cut down my history-taking and typing time by more than half, which means I finally have the freedom to focus more on my patients.”',
    name: 'Dr. Abhishek Gohel',
    title: 'Epileptologist · Ahmedabad',
    photo: 'https://cdn.eka.care/vagus/cmp0sugzb00020tdm1ws72rhl.png',
  },
];

export const MAX_SPECIALITIES = 3;
export const MAX_LANGUAGES = 2;

export const SUGGESTED_SPECIALITY_PILLS: SuggestedPill[] = [
  { id: 'general-physician', label: 'General Physician' },
  { id: 'paediatrician', label: 'Paediatrics' },
  { id: 'dermatologist', label: 'Dermatology' },
  { id: 'orthopaedician', label: 'Orthopaedics' },
  { id: 'psychiatrist', label: 'Psychiatry' },
  { id: 'cardiologist', label: 'Cardiology' },
  { id: 'neurologist', label: 'Neurology' },
  { id: 'pulmonogist', label: 'Pulmonology' },
  { id: 'obstetrician', label: 'Obstetrician' },
  { id: 'gynaecologist', label: 'Gynaecologist' },
];

const languagePill = (id: string): SuggestedPill => {
  const supported = SUPPORTED_LANGUAGES.find((l) => l.id === id);
  const label = supported?.name.replace(/\s*\(.+\)$/, '').trim() ?? id;
  return { id, label };
};

export const SUGGESTED_LANGUAGE_PILLS: SuggestedPill[] = ['en-IN', 'hi', 'kn', 'bn'].map(
  languagePill
);

export const FUTURE_STEPS = [
  {
    number: 1,
    title: 'Complete your clinic profile',
    description: 'Personalises notes with your clinic name, EMR, and specialty',
  },
  {
    number: 2,
    title: 'Set your default note format',
    description: 'Every session auto-generates in your preferred template',
  },
  {
    number: 3,
    title: 'Learn your keyboard shortcuts',
    description: 'Start and end recordings without touching the mouse',
  },
  {
    number: 4,
    title: 'Share notes via WhatsApp',
    description: 'Send prescriptions and visit summaries directly to patients',
  },
];
