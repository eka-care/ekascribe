'use client';

import { useCallback, useEffect } from 'react';
import useGetEkascribeConfig from '@/features/settings/hooks/use-get-config';
import useVoice2RxStore from '@/store/store';
import {
  CONSULTATION_MODES,
  SUPPORTED_LANGUAGES,
  findLanguage,
  SUPPORTED_OUTPUT_FORMATS,
} from '@/constants/settings';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { MODEL_TYPE } from '@/constants/enums';
import { TPreferenceItem } from '@/constants/types';
import useGetConfigMyTemplates from '@/features/templates/hooks/use-get-config-my-templates';
import { useGetAllTemplates } from '@/features/templates/hooks/use-get-all-templates';
import { getStorage } from '@/platform';
import { preserveSavedNoteDates } from '@/features/session/utils/saved-notes';

export const useSettings = () => {
  const {
    appConfig,
    setAppConfig,
    setUserLevelPreferences,
    setWorkspaceID,
    setLoggedInUserDetails,
    setRefreshLoggedInUserDetailsPromise,
    userSelectedTemplatesList,
    setUserSelectedTemplatesList,
  } = useVoice2RxStore();

  const {
    data: cachedConfigData,
    isLoading: isLoadingConfig,
  } = useGetEkascribeConfig();

  const { isLoading: isLoadingUserSelectedTemplatesList } = useGetConfigMyTemplates();

  // Cache all templates once and populate the id -> name map for session views.
  useGetAllTemplates();

  const validatePreferences = (
    saved: {
      input_languages?: TPreferenceItem[];
      output_format_template?: TPreferenceItem[];
      [key: string]: unknown;
    },
    supported_languages: TPreferenceItem[],
    supported_output_formats: TPreferenceItem[]
  ) => {
    const validLangIds = new Set(supported_languages.map((l) => l.id));
    const validFormatIds = new Set(supported_output_formats.map((f) => f.id));

    const input_languages = (() => {
      const valid = (saved.input_languages ?? []).filter((l) => validLangIds.has(l.id));
      if (valid.length) return valid;
      // Nothing selected in the config -> default to English + Hindi.
      const defaults = ['en', 'hi']
        .map((id) => supported_languages.find((l) => l.id === id) ?? findLanguage(id))
        .filter(Boolean) as TPreferenceItem[];
      return defaults.length ? defaults : [supported_languages[0] ?? SUPPORTED_LANGUAGES[0]];
    })();

    const output_format_template = (() => {
      const valid = (saved.output_format_template ?? []).filter((f) => validFormatIds.has(f.id));

      return valid;
      // if (valid.length) return valid;
      // return supported_output_formats.length
      //   ? [supported_output_formats[0]]
      //   : [SUPPORTED_OUTPUT_FORMATS[0]];
    })();

    return { input_languages, output_format_template };
  };

  const setDefaultAppConfig = () => {
    setAppConfig({
      supported_languages: SUPPORTED_LANGUAGES,
      output_template_formats: SUPPORTED_OUTPUT_FORMATS,
      consultation_modes: CONSULTATION_MODES,
      max_selection: {
        supported_languages: 2,
        supported_output_formats: 1,
        consultation_modes: 1,
      },
    });

    // Set default selected preferences on error
    setUserLevelPreferences({
      input_languages: [findLanguage('en-IN'), findLanguage('hi')].filter(
        Boolean
      ) as typeof SUPPORTED_LANGUAGES,
      output_language: 'en-IN',
      output_format_template: [SUPPORTED_OUTPUT_FORMATS[0]],
      consultation_mode: 'dictation',
      use_audio_cues: false,
      auto_download: false,
      model_type: MODEL_TYPE.PRO,
      auto_detect_language: false,
      model_training_consent: { value: true, editable: false },
    });
  };

  const fetchSettings = async () => {
    try {
      if (isLoadingConfig || isLoadingUserSelectedTemplatesList) return;

      let supported_languages = SUPPORTED_LANGUAGES;
      // let supported_output_formats = SUPPORTED_OUTPUT_FORMATS;
      let consultation_modes = CONSULTATION_MODES;
      let max_selection = {
        supported_languages: 2,
        supported_output_formats: 1,
        consultation_modes: 1,
      };
      let output_template_formats: TPreferenceItem[] = [];

      if (cachedConfigData) {
        supported_languages = cachedConfigData.supported_languages;
        consultation_modes = cachedConfigData.consultation_modes;
        max_selection = cachedConfigData.max_selection;

        setWorkspaceID(cachedConfigData.user_details['w-id']);

        const default_output_formats = SUPPORTED_OUTPUT_FORMATS;

        let custom_output_formats: TPreferenceItem[] = [];

        // favorite custom templates selected by user
        if (userSelectedTemplatesList && userSelectedTemplatesList.length > 0) {
          custom_output_formats = userSelectedTemplatesList.map((format) => {
            return {
              ...format,
              template_type: 'custom',
            };
          });
        }

        if (custom_output_formats.length > 0) {
          output_template_formats = custom_output_formats;
        } else {
          output_template_formats = default_output_formats;
        }

        setUserSelectedTemplatesList(output_template_formats);

        const previousSelectedPreferences = cachedConfigData.selected_preferences;

        const available_preferences = {
          supported_languages,
          consultation_modes,
          max_selection,
          output_template_formats,
          print_header: cachedConfigData.header,
          print_footer: cachedConfigData.footer,
          print_compact: cachedConfigData.print_compact,
          notes_ids: preserveSavedNoteDates(
            cachedConfigData.notes_ids,
            useVoice2RxStore.getState().appConfig.notes_ids
          ),
        };

        setAppConfig(available_preferences);

        const settings =
          cachedConfigData?.settings && Object.keys(cachedConfigData?.settings ?? {}).length
            ? cachedConfigData?.settings
            : { model_training_consent: { value: true, editable: false } };

        if (previousSelectedPreferences) {
          const {
            input_languages: validatedLanguages,
            output_format_template: validatedOutputFormats,
          } = validatePreferences(
            {
              input_languages: previousSelectedPreferences?.languages,
              output_format_template: previousSelectedPreferences?.output_formats,
            },
            supported_languages,
            output_template_formats
          );

          const isAutoDetect = validatedLanguages.some((l) => l.id === 'auto_detect');

          setUserLevelPreferences({
            input_languages: validatedLanguages,
            output_language: '',
            output_format_template: validatedOutputFormats,
            consultation_mode: 'dictation',
            use_audio_cues: previousSelectedPreferences?.use_audio_cues ?? false,
            auto_download: previousSelectedPreferences?.auto_download ?? false,
            model_type: previousSelectedPreferences?.model_type ?? MODEL_TYPE.PRO,
            auto_detect_language: isAutoDetect,
            model_training_consent: settings.model_training_consent ?? {
              value: true,
              editable: false,
            },
          });
        }
      } else {
        setDefaultAppConfig();
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setDefaultAppConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  const refreshConfig = useCallback(async () => {
    try {
      const getConfigResponse = await with401Retry(
        () => getSDK().sessions.getConfig(),
        'get ekascribe config'
      );

      const { data: configData } = getConfigResponse;

      if (configData) {
        getStorage().session.set('ekascribe-user-uuid', configData.user_details.uuid);
        setLoggedInUserDetails(configData.user_details);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [isLoadingConfig, isLoadingUserSelectedTemplatesList, cachedConfigData]);

  // Register refresh callback on mount
  useEffect(() => {
    setRefreshLoggedInUserDetailsPromise(refreshConfig);

    return () => {
      setRefreshLoggedInUserDetailsPromise(null);
    };
  }, []);

  return {
    appConfig,
    fetchSettings,
    refreshConfig,
  };
};
