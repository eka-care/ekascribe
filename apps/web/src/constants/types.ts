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
  /** Session meta blob stored on the transaction row; carries the user-set title. */
  session_details?: { title?: string };
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
  // Structuring models the deployment exposes (STRUCTURING_MODELS on the API).
  // Empty == the backend decides from env; no picker is shown.
  supported_models: TPreferenceItem[];
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
  notes_ids?: { id: string; name: string; added_at?: string }[];
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
