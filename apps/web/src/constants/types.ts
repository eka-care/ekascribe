import { RECORDING_SCREEN_STATE, RECORDING_STATE } from './enums';

export type TUser = {
  name: string;
  email: string;
  avatar?: string;
};

export type TMedications = {
  id: string;
  name: string;
  status: string;
  dose: {
    unit?: string;
    value?: number;
  };
  frequency: {
    custom: string;
  };
  duration: { custom?: string; unit?: string; value?: number };
  timing_code: {
    timing?: string;
  };
  instruction: string;
};

export type TSymptoms = {
  id: string;
  name: string;
  status: string;
  properties: {
    [key: string]: {
      name: string;
      selection: Array<{
        unit?: string;
        value?: string | number;
        id?: string;
      }>;
    };
  };
};

export type TAdvices = {
  id: string;
  name: string;
  status?: string;
  parsedText: string;
  date?: string;
  notes?: string;
  remark?: string;
};

export type TLabRx = {
  id: string;
  name: string;
  remark?: string;
  status: string;
  value?: number | string;
  interpretation?: {
    eka_id: string;
    id: string;
    value: string;
  };
  notes?: string;
};

export type TPatientMedicalHistoryItem = {
  id?: string;
  name?: string;
  notes?: string;
  status?: string;
  since?: {
    custom: string;
  };
  frequency?: {
    custom: string;
  };
  who?: string;
};

export type TPatientMedicalHistory = {
  patientMedicalConditions?: TPatientMedicalHistoryItem[];
  lifestyleHabits?: TPatientMedicalHistoryItem[];
  currentMedications?: TPatientMedicalHistoryItem[];
  drugAllergy?: TPatientMedicalHistoryItem[];
  foodOtherAllergy?: TPatientMedicalHistoryItem[];
  pastProcedures?: TPatientMedicalHistoryItem[];
  familyHistory?: TPatientMedicalHistoryItem[];
  recentTravelHistory?: TPatientMedicalHistoryItem[];
  vaccinationHistory?: TPatientMedicalHistoryItem[];
};

export type TVitals = {
  name?: string;
  id?: string;
  value?: {
    qt?: number | string;
    unit?: string;
  };
  notes?: string;
};

export type TMedicalHistory = {
  patientHistory: TPatientMedicalHistory;
  vitals: TVitals[];
  examinations: TVitals[];
};

export type TReferToDoctor = {
  id: string;
  name: string;
  status: string;
  notes: string;
  doc: {
    name: {
      f: string;
      l: string;
    };
    clinic: {
      landmark: string;
      city: string;
      pincode: string;
    };
    note: string;
  }[];
};

export type TStructuredSummary = {
  medications: TMedications[];
  symptoms: TSymptoms[];
  diagnosis: TSymptoms[];
  advices: TAdvices[];
  labTests: TLabRx[];
  labVitals: TLabRx[];
  followup: TAdvices;
  prescriptionNotes: TAdvices;
  privateNotes: TAdvices;
  patientHistory: TPatientMedicalHistory;
  vitals: TVitals[];
  examinations: TVitals[];
  procedures: TLabRx[];
  medicalHistory?: TMedicalHistory;
  dentalProcedures: TLabRx[];
  refer: TReferToDoctor;
};

export type TPastSessionHistory = TPastSessionHistoryData[];

export type TPastSessionHistoryData = {
  created_at: string;
  b_id: string;
  user_status: string;
  processing_status: string;
  txn_id: string;
  mode: string;
  uuid: string;
  oid: string;
  patient_details?: TSelectedPatientDetails;
};

export type TPreferenceItem = {
  id: string;
  name: string;
  desc?: string;
  template_type?: string;
};

export type TSettingItem = { value: boolean; editable: boolean };

export type TUserSelectedPreferences = {
  input_languages: TPreferenceItem[];
  output_language?: string;
  output_format_template: TPreferenceItem[];
  consultation_mode: string;
  use_audio_cues: boolean;
  auto_download: boolean;
  model_type: string;
  auto_detect_language: boolean;
  model_training_consent: TSettingItem;
};

export type TPrintConfigSection =
  | {
      type: 'image';
      url: string;
      content_type?: string;
      width: number;
      height: number;
      unit: 'cm' | 'mm';
    }
  | {
      type: 'margin';
      width: number;
      height: number;
      unit: 'cm' | 'mm';
    };

export type TAppConfig = {
  supported_languages: TPreferenceItem[];
  output_template_formats: TPreferenceItem[];
  consultation_modes: TPreferenceItem[];
  max_selection: {
    supported_languages: number;
    supported_output_formats: number;
    consultation_modes: number;
  };
  print_header?: TPrintConfigSection;
  print_footer?: TPrintConfigSection;
  print_compact?: boolean;
  notes_ids?: { id: string; name: string }[];
};

export type TOutputSummary = {
  template_id: string;
  document_id: string;
  document_type?: string;
  document_path?: {
    bucket: string;
    folder: string;
    filename: string;
  };
  presigned_url?: string;
  value?: any;
  type: string;
  name: string;
  lang?: string;
  status: TOutputSummaryTemplateStatus;
  errors?: TOutputSummaryTemplateMessage[];
  warnings?: TOutputSummaryTemplateMessage[];
  publish?: Record<string, { status?: string; error?: string | null; updated_at?: number }>;
};

export type TOutputSummaryTemplateStatus =
  | 'success'
  | 'partial_success'
  | 'failure'
  | 'in-progress';

export type TOutputSummaryTemplateMessage = {
  type: 'warning' | 'error';
  code?: string;
  msg: string;
};

export type TOutputSessionData = {
  patient_details: TSelectedPatientDetails | null;
  audio_matrix: { quality: string } | null;
  created_at: string;
  template_results: {
    integration: TOutputSummary[];
    custom: TOutputSummary[];
    transcript: TOutputSummary[];
  };
  additional_data?: any;
};

export type Gender = 'M' | 'F' | 'O';

export type TSearchPatient = {
  oid: string;
  c_ate?: number;
  u_ate?: number;
  gen: Gender;
  fn?: string;
  mn?: string;
  ln?: string;
  fln?: string;
  dob: string; // convert it to age
  email?: string;
  mobile?: string;
  username: string;
  age: number;
};

export type TSelectedPatientDetails = {
  oid?: string;
  username: string;
  age: number;
  biologicalSex: Gender;
  email?: string;
  mobile?: string;
};

export type TSystemInfo = {
  platform: string;
  language: string;
  hardware_concurrency?: number; // Optional, as support might vary
  device_memory?: number; // Optional, as support might vary
  time_zone: string;
  network_info?: TNetworkInfo;
};

type TNetworkInfo = {
  effective_type: string;
  latency: number;
  download_speed: number;
  connection_type: string;
};

export type TTemplateData = {
  id?: string;
  title?: string;
  desc?: string;
  default?: boolean;
};

export type TLoggedInUserDetails = {
  fn: string;
  mn: string;
  ln: string;
  dob: string;
  gen: 'F' | 'M' | 'O';
  s: string;
  is_paid_doc: boolean;
  is_eka_doc: boolean;
  uuid: string;
  oid: string;
  'b-id': string;
  'w-n': string;
};

export type TPricingCardProps = {
  id: string;
  name: string;
  badge: string | null;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' | null;
  description: string;
  price: {
    monthly: { price: string; rawPrice: number; currency: string; symbol: string; link: string };
    yearly: { price: string; rawPrice: number; currency: string; symbol: string; link: string };
  } | null;
  buttonText: string;
  buttonVariant: 'default' | 'link' | 'secondary' | 'destructive' | 'outline' | 'ghost' | null;
  buttonDisabled: boolean;
  buttonAction: () => void;
  features: {
    label: string;
    subfeatures?: string[];
  }[];
  isPopular: boolean;
  cardStyle: { minHeight: string };
  cardClassName: string;
};

export type TProcessingStatus =
  | 'not-started'
  | 'recording'
  | 'paused'
  | 'resume'
  | 'analysing'
  | 'output'
  | 'transcript'
  | 'upload_audio'
  | 'unsuccessful-session';

export type TUserOngoingSessionData = {
  b_id?: string;
  user_status?: string;
  processing_status: TProcessingStatus;
  patient_details?: TSelectedPatientDetails;
  session_duration: number;
  recording_screen_state: RECORDING_SCREEN_STATE;
  audio_amplitudes: number[];
  session_recording_state: RECORDING_STATE;
  session_id: string;
  context_content?: string;
  notes?: { id: string; label: string; content: string }[];
  context?: {
    past_sessions?: { id: string; created_at: string }[];
    attachments?: { id: string; name: string; patient_oid?: string }[];
  };
};

// Drugs & Labs search (mdb.eka.care)
export type TDrugSearchResult = {
  id: string;
  name: string;
  manufacturer_name?: string;
  product_type?: string;
  product_sku?: string;
  generic_name?: string;
  generic_id?: string;
  dosage?: {
    unit?: string;
    unit_name?: string;
    unit_id?: string;
    dosage?: string;
    dosage_form?: string;
    df_id?: string;
    days?: string;
    food?: string;
  };
  action_class?: Record<string, unknown>;
  common_name?: string;
  soa?: boolean;
  hxng_mapped?: string;
  hxng_status?: string;
  mapping_status?: {
    onemg_mapped?: string;
    medpay_mapped?: string;
  };
  drug_name_match?: boolean;
  is_cerebro_verified?: boolean;
  include_suggestion?: boolean;
  highlighted_fields?: Record<string, unknown>;
};

export type TLabTestSearchResult = {
  id: string;
  name: string;
  [key: string]: unknown;
};

export type TGetMdbV1DrugsAndLabsResponse = {
  status_code: number;
  data?: {
    drugs: TDrugSearchResult[];
    lab_tests: TLabTestSearchResult[];
  };
  error?: string;
};
