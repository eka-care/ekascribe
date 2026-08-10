import { create } from 'zustand';
import TStore from './types';
import { TAppConfig, TUserSelectedPreferences } from '@/constants/types';
import { MODEL_TYPE, SESSION_PHASE } from '@/constants/enums';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { getStorage } from '@/platform';
import type {
  SessionV2Ongoing,
  SessionV2Content,
  SessionV2UiState,
  NormalizedDocument,
} from '@/features/session/types';

export const emptySessionV2Ongoing: SessionV2Ongoing = {
  recording_session_id: '',
};

const emptySessionV2UiState = {
  loading: false,
  poll_status: 'idle' as const,
  selected_tab: 'context',
  selected_transcript_lang: '',
  save_status_by_doc: {} as Record<string, 'idle' | 'typing' | 'synced' | 'error'>,
  last_synced_at: 0,
  is_template_processing: false,
  transcript_loading: {} as Record<string, boolean>,
  pending_paste_scroll_doc_id: null as SessionV2UiState['pending_paste_scroll_doc_id'],
  pending_reload_doc_id: null as SessionV2UiState['pending_reload_doc_id'],
};

export const emptySessionV2Content: SessionV2Content = {
  phase: SESSION_PHASE.IDLE,
  error: null,
  is_limit_exceeded: false,
  patient_details: null,
  created_at: '',
  upload_url: {},
  expires_at: '',
  session_duration: 0,
  audio_amplitudes: [],
  is_speaking: false,
  chunk_transcripts: {},
  uploaded_chunks: [],
  upload_progress: { success: 0, total: 0 },
  audio_matrix: null,
  additional_data: {},
  session_details: {},
  session_config: null,
  session_context: {},
  user_status: '',
  context: [],
  transcript: [],
  documents: [],
  ui: emptySessionV2UiState,
};

const storeInitialState = {
  workspaceID: '',
  templateData: null,
  bannerTitle: undefined,
  bannerSubtitle: undefined,
  bannerActionComponent: undefined,
  bannerTimeout: undefined,
  showBannerCrossIcon: true,
  warningMessage: undefined,
  warningIcon: undefined,
  warningAction: undefined,
  warningListHeader: undefined,
  warningListItems: undefined,
  warningType: undefined,
  playAudioCues: false,
  sessionV2Ongoing: emptySessionV2Ongoing,
  sessionV2ContentById: {} as Record<string, SessionV2Content>,
};

export const emptyUserSelectedPreferences: TUserSelectedPreferences = {
  input_languages: [],
  output_language: '',
  output_format_template: [],
  consultation_mode: '',
  use_audio_cues: false,
  auto_download: false,
  auto_detect_language: false,
  model_type: MODEL_TYPE.PRO,
  model_training_consent: { value: true, editable: false },
};

// Only these survive a page refresh (sessionStorage). Everything else — transient UI,
// template-editor scratch, derived/refetched data, callbacks — resets to its initial value on rehydrate.
const PERSISTED_KEYS = [
  'workspaceID',
  'appConfig',
  'userLevelPreferences',
  'userRegion',
  'loggedInUserDetails',
  'userSelectedTemplatesList',
  'templateNameById',
  'selectedMicrophone',
  'sessionV2Ongoing',
  'newSessionId',
  'sessionV2ContentById',
] as const satisfies readonly (keyof TStore)[];

// Session-scoped backend for the persisted store, routed through the platform storage
// capability instead of touching `sessionStorage` directly.
const sessionStateStorage: StateStorage = {
  getItem: (name) => getStorage().session.get(name),
  setItem: (name, value) => getStorage().session.set(name, value),
  removeItem: (name) => getStorage().session.remove(name),
};

const useVoice2RxStore = create<TStore>()(
  persist(
    (set) => ({
      workspaceID: '',
      setWorkspaceID: (workspaceID) => set({ workspaceID }),

      appConfig: {
        supported_languages: [],
        output_template_formats: [],
        consultation_modes: [],
        max_selection: {
          supported_languages: 2,
          supported_output_formats: 1,
          consultation_modes: 1,
        },
      },
      setAppConfig: (config: TAppConfig) => set({ appConfig: config }),

      userLevelPreferences: emptyUserSelectedPreferences,
      setUserLevelPreferences: (settings: TUserSelectedPreferences) =>
        set({ userLevelPreferences: settings }),

      playAudioCues: false,
      setPlayAudioCues: (playAudioCues) => set({ playAudioCues }),

      setWarningInfo: (warningInfo) =>
        set({
          warningMessage: warningInfo.message,
          warningIcon: warningInfo.Icon,
          warningAction: warningInfo.ActionComponent,
          warningListHeader: warningInfo.listHeader,
          warningListItems: warningInfo.listItems,
          warningType: warningInfo.type,
          warningScreen: warningInfo.screen,
        }),

      clearWarningInfo: () =>
        set({
          warningMessage: undefined,
          warningIcon: undefined,
          warningAction: undefined,
          warningListHeader: undefined,
          warningListItems: undefined,
          warningType: undefined,
          warningScreen: undefined,
        }),


      templateData: null,
      setTemplateData: (data) => set({ templateData: data }),

      userSelectedTemplatesList: [],
      setUserSelectedTemplatesList: (list) => set({ userSelectedTemplatesList: list }),

      templateNameById: {},
      setTemplateNameById: (map) => set({ templateNameById: map }),

      templateAction: 'create',
      setTemplateAction: (action) => set({ templateAction: action }),

      loggedInUserDetails: null,
      setLoggedInUserDetails: (user) => set({ loggedInUserDetails: user }),

      userRegion: null,
      setUserRegion: (region) => set({ userRegion: region }),

      selectedMicrophone: null,
      setSelectedMicrophone: (microphone) => set({ selectedMicrophone: microphone }),

      refreshPastSessionsCallback: null,
      setRefreshPastSessionsCallback: (refreshFn) =>
        set({ refreshPastSessionsCallback: refreshFn }),

      refreshLoggedInUserDetailsPromise: null,
      setRefreshLoggedInUserDetailsPromise: (refreshFn) =>
        set({ refreshLoggedInUserDetailsPromise: refreshFn }),

      setBannerInfo: (bannerInfo) =>
        set({
          bannerTitle: bannerInfo.title,
          bannerSubtitle: bannerInfo.subtitle,
          bannerActionComponent: bannerInfo.ActionComponent,
          showBannerCrossIcon: bannerInfo.showBannerCrossIcon,
          bannerTimeout: bannerInfo.bannerTimeout,
          showForAllUsers: bannerInfo.showForAllUsers,
        }),

      clearBannerInfo: () =>
        set({
          bannerTitle: undefined,
          bannerSubtitle: undefined,
          bannerActionComponent: undefined,
          bannerTimeout: undefined,
          showBannerCrossIcon: true,
          showForAllUsers: true,
        }),


      autoStartRecording: false,
      setAutoStartRecording: (value) => set({ autoStartRecording: value }),
      // --- V2 Session State ---
      sessionV2Ongoing: emptySessionV2Ongoing,
      // Id of the session created via the new-session flow. Drives the "Current Session" card
      // independently of history-list membership (which a refetch can change).
      newSessionId: '',
      setNewSessionId: (sessionId) => set({ newSessionId: sessionId }),
      setRecordingSessionId: (sessionId) =>
        set({ sessionV2Ongoing: { recording_session_id: sessionId } }),
      clearRecordingSessionId: () => set({ sessionV2Ongoing: emptySessionV2Ongoing }),

      sessionV2ContentById: {},
      setSessionV2Content: (sessionId, data) =>
        set((state) => {
          const prev = state.sessionV2ContentById[sessionId] || emptySessionV2Content;
          const next = typeof data === 'function' ? data(prev) : { ...prev, ...data };
          return {
            sessionV2ContentById: {
              ...state.sessionV2ContentById,
              [sessionId]: next,
            },
          };
        }),

      setSessionV2Document: (sessionId, documentId, data) =>
        set((state) => {
          const session = state.sessionV2ContentById[sessionId];
          if (!session) return state;

          const updateDocs = (docs: NormalizedDocument[]) =>
            docs.map((d) => (d.document_id === documentId ? { ...d, ...data } : d));

          return {
            sessionV2ContentById: {
              ...state.sessionV2ContentById,
              [sessionId]: {
                ...session,
                context: updateDocs(session.context),
                transcript: updateDocs(session.transcript),
                documents: updateDocs(session.documents),
              },
            },
          };
        }),

      addSessionV2Document: (sessionId, document) =>
        set((state) => {
          const session = state.sessionV2ContentById[sessionId];
          if (!session) return state;

          const bucket =
            document.document_type === 'context'
              ? 'context'
              : document.document_type === 'transcript'
              ? 'transcript'
              : 'documents';

          return {
            sessionV2ContentById: {
              ...state.sessionV2ContentById,
              [sessionId]: {
                ...session,
                [bucket]: [...session[bucket], document],
              },
            },
          };
        }),

      removeSessionV2Document: (sessionId, documentId) =>
        set((state) => {
          const session = state.sessionV2ContentById[sessionId];
          if (!session) return state;

          const removeDocs = (docs: NormalizedDocument[]) =>
            docs.filter((d) => d.document_id !== documentId);

          return {
            sessionV2ContentById: {
              ...state.sessionV2ContentById,
              [sessionId]: {
                ...session,
                context: removeDocs(session.context),
                transcript: removeDocs(session.transcript),
                documents: removeDocs(session.documents),
              },
            },
          };
        }),

      setSessionV2Ui: (sessionId, data) =>
        set((state) => {
          const session = state.sessionV2ContentById[sessionId];
          if (!session) return state;
          return {
            sessionV2ContentById: {
              ...state.sessionV2ContentById,
              [sessionId]: {
                ...session,
                ui: { ...session.ui, ...data },
              },
            },
          };
        }),

      setTranscriptLangLoading: (sessionId, lang, loading) =>
        set((state) => {
          const session = state.sessionV2ContentById[sessionId];
          if (!session) return state;

          return {
            sessionV2ContentById: {
              ...state.sessionV2ContentById,
              [sessionId]: {
                ...session,
                ui: {
                  ...session.ui,
                  transcript_loading: {
                    ...session.ui.transcript_loading,
                    [lang]: loading,
                  },
                },
              },
            },
          };
        }),

      setDocSaveStatus: (sessionId, docKey, status) =>
        set((state) => {
          const session = state.sessionV2ContentById[sessionId];
          if (!session) return state;
          return {
            sessionV2ContentById: {
              ...state.sessionV2ContentById,
              [sessionId]: {
                ...session,
                ui: {
                  ...session.ui,
                  save_status_by_doc: {
                    ...session.ui.save_status_by_doc,
                    [docKey]: status,
                  },
                },
              },
            },
          };
        }),

      clearSessionV2Content: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...rest } = state.sessionV2ContentById;
          return { sessionV2ContentById: rest };
        }),

      clearStore: () =>
        set((state) => ({
          ...storeInitialState,
          workspaceID: state.workspaceID,
          sessionV2ContentById: state.sessionV2ContentById,
        })),
    }),
    {
      name: 'ekascribe-ai-store',
      storage: createJSONStorage(() => sessionStateStorage),
      partialize: (state) =>
        Object.fromEntries(PERSISTED_KEYS.map((key) => [key, state[key]])) as Pick<
          TStore,
          (typeof PERSISTED_KEYS)[number]
        >,
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        for (const [sessionId, content] of Object.entries(state.sessionV2ContentById)) {
          // Reset transient per-document UI status
          let next = {
            ...content,
            ui: {
              ...content.ui,
              loading: false,
              poll_status: 'idle' as const,
              save_status_by_doc: {},
              is_template_processing: false,
              transcript_loading: {},
              pending_paste_scroll_doc_id: null,
              pending_reload_doc_id: null,
            },
          };

          // Reset transient recording state on rehydrate — a page refresh means the
          // recording was lost, so clean up stale runtime fields.
          const { phase } = content;
          if (
            phase === SESSION_PHASE.RECORDING ||
            phase === SESSION_PHASE.PAUSED ||
            phase === SESSION_PHASE.PROCESSING
          ) {
            next = {
              ...next,
              phase: SESSION_PHASE.IDLE,
              session_duration: 0,
              audio_amplitudes: [],
              is_speaking: false,
              chunk_transcripts: {},
              uploaded_chunks: [],
              upload_progress: { success: 0, total: 0 },
            };
          }

          state.sessionV2ContentById[sessionId] = next;
        }
      },
    }
  )
);

export default useVoice2RxStore;
