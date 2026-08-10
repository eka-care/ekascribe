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

export const SUPPORTED_EMRS: TPreferenceItem[] = [
  { id: 'ace-health-solutions', name: 'Ace Health Solutions' },
  { id: 'advancedmd', name: 'AdvancedMD' },
  { id: 'allscripts', name: 'Allscripts' },
  { id: 'amazing-charts', name: 'Amazing Charts' },
  { id: 'athenahealth', name: 'athenahealth' },
  { id: 'attune-technologies', name: 'Attune Technologies' },
  { id: 'bestdoc', name: 'BestDoc' },
  { id: 'birlamedisoft', name: 'Birlamedisoft' },
  { id: 'carecloud', name: 'CareCloud' },
  { id: 'cerner-oracle-health', name: 'Cerner Oracle Health' },
  { id: 'chartlogic', name: 'ChartLogic' },
  { id: 'chirotouch', name: 'ChiroTouch' },
  { id: 'cloudnine', name: 'Cloudnine' },
  { id: 'compurx-infotech', name: 'CompuRx Infotech' },
  { id: 'compulink', name: 'Compulink' },
  { id: 'cpsi', name: 'CPSI' },
  { id: 'curemd', name: 'CureMD' },
  { id: 'dentrix', name: 'Dentrix' },
  { id: 'docengage', name: 'DocEngage' },
  { id: 'docon', name: 'DocOn' },
  { id: 'docpulse', name: 'DocPulse' },
  { id: 'drchrono', name: 'DrChrono' },
  { id: 'eka-care', name: 'Eka Care' },
  { id: 'elation-health', name: 'Elation Health' },
  { id: 'ema-by-modernizing-medicine', name: 'EMA by Modernizing Medicine' },
  { id: 'eclinicalworks', name: 'eClinicalWorks' },
  { id: 'ehospital-systems', name: 'eHospital Systems' },
  { id: 'epic', name: 'Epic' },
  { id: 'ezovion', name: 'Ezovion' },
  { id: 'greenway-health', name: 'Greenway Health' },
  { id: 'harris-healthcare', name: 'Harris Healthcare' },
  { id: 'healthplix', name: 'HealthPlix' },
  { id: 'healthray', name: 'Healthray' },
  { id: 'inicu', name: 'iNICU' },
  { id: 'insta-by-practo', name: 'Insta by Practo' },
  { id: 'intellimed', name: 'IntelliMed' },
  { id: 'jeevanti', name: 'Jeevanti' },
  { id: 'kareo', name: 'Kareo' },
  { id: 'lybrate', name: 'Lybrate' },
  { id: 'matrixcare', name: 'MatrixCare' },
  { id: 'medevolve', name: 'MedEvolve' },
  { id: 'medhost', name: 'Medhost' },
  { id: 'meditech', name: 'MEDITECH' },
  { id: 'medixcel', name: 'Medixcel' },
  { id: 'medmantra', name: 'Medmantra' },
  { id: 'medmind-technologies', name: 'MedMind Technologies' },
  { id: 'modmed', name: 'ModMed' },
  { id: 'mocdoc', name: 'MocDoc' },
  { id: 'nephroplus', name: 'NephroPlus' },
  { id: 'netsmart', name: 'Netsmart' },
  { id: 'nextech', name: 'Nextech' },
  { id: 'nextgen-healthcare', name: 'NextGen Healthcare' },
  { id: 'nicksoft', name: 'NICKSoft' },
  { id: 'office-practicum', name: 'Office Practicum' },
  { id: 'open-dental', name: 'Open Dental' },
  { id: 'paras-hmis', name: 'Paras HMIS' },
  { id: 'pcc-pediatric-solutions', name: 'PCC Pediatric Solutions' },
  { id: 'pointclickcare', name: 'PointClickCare' },
  { id: 'practice-fusion', name: 'Practice Fusion' },
  { id: 'practo', name: 'Practo' },
  { id: 'praxis-emr', name: 'Praxis EMR' },
  { id: 'prognocis', name: 'PrognoCIS' },
  { id: 'remedy-hms', name: 'Remedy HMS' },
  { id: 'sevocity', name: 'Sevocity' },
  { id: 'simplepractice', name: 'SimplePractice' },
  { id: 'softclinic', name: 'SoftClinic' },
  { id: 'therapynotes', name: 'TherapyNotes' },
  { id: 'trakcare', name: 'TrakCare' },
  { id: 'veradigm', name: 'Veradigm' },
  { id: 'webpt', name: 'WebPT' },
  { id: 'other', name: 'Other' },
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
