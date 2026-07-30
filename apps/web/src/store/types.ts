import { ONBOARDING_STEP } from '@/constants/enums';
import {
  TAppConfig,
  TLoggedInUserDetails,
  TPreferenceItem,
  TSearchPatient,
  TSelectedPatientDetails,
  TTemplateData,
  TUserSelectedPreferences,
} from '@/constants/types';
import { RegionInfo } from '@/utils/geolocation';
import type {
  SessionV2Ongoing,
  SessionV2Content,
  SessionV2UiState,
  NormalizedDocument,
} from '@/features/session/types';

export type TWarningScreen =
  | 'start_session'
  | 'recording'
  | 'template'
  | 'output_summary'
  | 'upload_transcription'
  | 'upload_audio'
  | 'onboarding';

type TStore = {
  workspaceID: string;
  setWorkspaceID: (workspaceID: string) => void;

  /**
   * get config api response with supported configurations
   */
  appConfig: TAppConfig;
  setAppConfig: (config: TAppConfig) => void;

  /**
   * selected preferences at user level
   */
  userLevelPreferences: TUserSelectedPreferences;
  setUserLevelPreferences: (userLevelPreferences: TUserSelectedPreferences) => void;

  playAudioCues: boolean;
  setPlayAudioCues: (playAudioCues: boolean) => void;

  /**
   * suggestions patients array for autocomplete input
   */
  searchedPatientsList: TSearchPatient[] | [];
  setSearchedPatientsList: (patients: TSearchPatient[]) => void;

  warningMessage?: string;
  warningIcon?: React.FC;
  warningAction?: React.FC;
  warningListHeader?: string;
  warningListItems?: string[];
  warningType?: 'warning' | 'error' | 'success';
  warningScreen?: TWarningScreen;

  setWarningInfo: (info: {
    message: string;
    Icon?: React.FC;
    ActionComponent?: React.FC;
    listHeader?: string;
    listItems?: string[];
    type?: 'warning' | 'error' | 'success';
    screen?: TWarningScreen;
  }) => void;
  clearWarningInfo: () => void;

  templateData: TTemplateData | null;
  setTemplateData: (data: TTemplateData | null) => void;

  userSelectedTemplatesList: TPreferenceItem[] | [];
  setUserSelectedTemplatesList: (list: TPreferenceItem[]) => void;

  // id -> name map of all templates (cached), used to resolve session template names in the UI
  templateNameById: Record<string, string>;
  setTemplateNameById: (map: Record<string, string>) => void;

  templateAction: 'create' | 'edit' | 'ai';
  setTemplateAction: (action: 'create' | 'edit' | 'ai') => void;

  loggedInUserDetails: TLoggedInUserDetails | null;
  setLoggedInUserDetails: (user: TLoggedInUserDetails) => void;

  userRegion: RegionInfo | null;
  setUserRegion: (region: RegionInfo) => void;

  selectedMicrophone: {
    deviceId: string;
    label: string;
  } | null;
  setSelectedMicrophone: (microphone: { deviceId: string; label: string } | null) => void;

  refreshPastSessionsCallback: (() => Promise<void>) | null;
  setRefreshPastSessionsCallback: (refreshFn: (() => Promise<void>) | null) => void;

  refreshLoggedInUserDetailsPromise: (() => Promise<void>) | null;
  setRefreshLoggedInUserDetailsPromise: (refreshFn: (() => Promise<void>) | null) => void;

  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerActionComponent?: React.FC;
  showBannerCrossIcon?: boolean;
  bannerTimeout?: number;
  showForAllUsers?: boolean;
  setBannerInfo: (info: {
    title: string;
    subtitle?: string;
    ActionComponent?: React.FC;
    showBannerCrossIcon?: boolean;
    bannerTimeout?: number;
    showForAllUsers?: boolean;
  }) => void;
  clearBannerInfo: () => void;

  onboarding_state: ONBOARDING_STEP | null;
  setOnboardingState: (state: ONBOARDING_STEP) => void;
  clearOnboardingState: () => void;

  /**
   * Sidebar active tab state
   */
  sidebarActiveTab: 'my_queue' | 'past_sessions';
  setSidebarActiveTab: (tab: 'my_queue' | 'past_sessions') => void;
  isRecordsTabActive: boolean;
  setIsRecordsTabActive: (active: boolean) => void;
  isVitalsGridOpen: boolean;
  setIsVitalsGridOpen: (open: boolean) => void;

  /**
   * Track completed sessions for queue patients (by patient oid)
   */
  completedQueuePatients: string[];

  /**
   * Callback to refresh queue appointments
   */
  refreshQueueAppointmentsCallback: (() => Promise<void>) | null;
  setRefreshQueueAppointmentsCallback: (callback: (() => Promise<void>) | null) => void;

  queueCount: number | null;
  setQueueCount: (count: number | null) => void;

  selectedQueueClinicId: string | null;
  setSelectedQueueClinicId: (clinicId: string | null) => void;

  selectedQueueDoctorId: string | null;
  setSelectedQueueDoctorId: (doctorId: string | null) => void;

  queueRecordingPatientOid: string | null;
  setQueueRecordingPatientOid: (oid: string | null) => void;

  pendingQueuePatient: TSelectedPatientDetails | null;
  setPendingQueuePatient: (patient: TSelectedPatientDetails | null) => void;

  addCompletedQueuePatient: (patientOid: string) => void;

  autoStartRecording: boolean;
  setAutoStartRecording: (value: boolean) => void;

  clearStore: () => void;

  // --- V2 Session State ---
  sessionV2Ongoing: SessionV2Ongoing;
  newSessionId: string;
  setNewSessionId: (sessionId: string) => void;
  setRecordingSessionId: (sessionId: string) => void;
  clearRecordingSessionId: () => void;

  sessionV2ContentById: Record<string, SessionV2Content>;
  setSessionV2Content: (
    sessionId: string,
    data: Partial<SessionV2Content> | ((prev: SessionV2Content) => SessionV2Content)
  ) => void;
  setSessionV2Document: (
    sessionId: string,
    documentId: string,
    data: Partial<NormalizedDocument>
  ) => void;
  addSessionV2Document: (sessionId: string, document: NormalizedDocument) => void;
  removeSessionV2Document: (sessionId: string, documentId: string) => void;
  setSessionV2Ui: (sessionId: string, data: Partial<SessionV2UiState>) => void;
  setTranscriptLangLoading: (sessionId: string, lang: string, loading: boolean) => void;
  setDocSaveStatus: (
    sessionId: string,
    docKey: string,
    status: 'idle' | 'typing' | 'synced' | 'error'
  ) => void;
  clearSessionV2Content: (sessionId: string) => void;
};

export default TStore;
