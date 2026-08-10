'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogOverlay,
  DialogDescription,
  Label,
  Button,
} from '@ui/src';
import { Checkbox } from '@ui/src/shadcn-ui/components/ui/checkbox';
import { toast } from 'sonner';
import useVoice2RxStore from '@/store/store';
import { useSettings } from '@/features/settings/hooks/use-settings';
import { getEkascribeConfigQueryKey } from '@/features/settings/hooks/use-get-config';
import { useQueryClient } from '@tanstack/react-query';
import { TPreferenceItem, TUserSelectedPreferences } from '@/constants/types';
import { MODEL_TYPE, MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { tracker } from '@/analytics';
import MultiSelectInput from '@/shared-components/input/multi-select-input';
import SearchableCombobox from '@/shared-components/input/searchable-combobox';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../../services/sdk-service';
import { getSDK } from '../../services/sdk-provider';

interface EditPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionID: string;
}

export function EditPreferencesDialog({
  open,
  onOpenChange,
  sessionID,
}: EditPreferencesDialogProps) {
  useSettings();

  const appConfig = useVoice2RxStore((state) => state.appConfig);
  const userLevelPreferences = useVoice2RxStore((state) => state.userLevelPreferences);
  const userSelectedTemplatesList = useVoice2RxStore((state) => state.userSelectedTemplatesList);
  const setUserLevelPreferences = useVoice2RxStore((state) => state.setUserLevelPreferences);
  const setSessionV2Content = useVoice2RxStore((state) => state.setSessionV2Content);
  const queryClient = useQueryClient();

  // Local state for form values - same type as store
  const [localPreferences, setLocalPreferences] = useState<TUserSelectedPreferences>({
    input_languages: [],
    output_language: '',
    output_format_template: [],
    consultation_mode: '',
    model_type: MODEL_TYPE.PRO,
    use_audio_cues: false,
    auto_download: false,
    auto_detect_language: false,
    model_training_consent: { value: true, editable: false },
  });

  // Seed form on dialog open — reads store snapshot to avoid re-seeding mid-edit.
  useEffect(() => {
    if (!open) return;

    const sessionConfig =
      useVoice2RxStore.getState().sessionV2ContentById[sessionID]?.session_config;
    const userPrefs = useVoice2RxStore.getState().userLevelPreferences;

    // Brand-new session with no saved config yet — seed with the user's defaults.
    if (!sessionConfig) {
      setLocalPreferences(userPrefs);
      return;
    }

    setLocalPreferences({
      ...userPrefs,
      input_languages: sessionConfig.input_languages,
      output_format_template: sessionConfig.output_format_template,
      auto_detect_language: sessionConfig.input_languages.some((l) => l.id === 'auto_detect'),
    });
  }, [open, sessionID]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Keep this session's own config in sync so the header reflects the edit immediately.
    setSessionV2Content(sessionID, {
      session_config: {
        input_languages: localPreferences.input_languages,
        output_format_template: localPreferences.output_format_template,
        consultation_mode: 'dictation',
        model_type: MODEL_TYPE.PRO,
      },
    });

    onOpenChange(false);

    tracker.log({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_NEW_SESSION,
      type: MIXPANEL_EVENT_TYPE.EDIT_PREFERENCES,
    });

    const inputLanguage = localPreferences.input_languages.map((l) => l.id);
    const outputTemplates = localPreferences.output_format_template.map((t) => t.id);

    // model + session_mode mirror what createSession sends, so per-session model/mode edits persist.
    const patchPayload = {
      templates: outputTemplates,
      language_hint: inputLanguage,
      model: MODEL_TYPE.PRO,
      session_mode: 'dictation',
    };

    await with401Retry(
      () => getSDK().sessions.patchSessionStatus(patchPayload, sessionID),
      'patch session preferences'
    );
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleLanguagesChange = (selected: TPreferenceItem[]) => {
    setLocalPreferences((prev) => {
      const prevHasAuto = prev.input_languages.some((l) => l.id === 'auto_detect');
      const nextHasAuto = selected.some((l) => l.id === 'auto_detect');

      const inputLanguages =
        nextHasAuto && (prevHasAuto || selected.length > 1)
          ? selected.filter((l) => l.id === 'auto_detect')
          : selected;

      return {
        ...prev,
        input_languages: inputLanguages,
        auto_detect_language: nextHasAuto,
      };
    });
  };

  const handleOutputFormatsChange = (selected: string) => {
    const selectedTemplate = userSelectedTemplatesList.find((template) => template.id === selected);
    if (!selectedTemplate) return;
    setLocalPreferences((prev) => ({
      ...prev,
      output_format_template: [selectedTemplate],
    }));
  };

  const getSortedIds = (items: TPreferenceItem[]) => items.map((i) => i.id).sort();

  const arePreferencesEqual = (
    a?: TUserSelectedPreferences,
    b?: TUserSelectedPreferences
  ): boolean => {
    if (!a || !b) return false;
    const aLangIds = getSortedIds(a.input_languages);
    const bLangIds = getSortedIds(b.input_languages);
    const aOutIds = getSortedIds(a.output_format_template);
    const bOutIds = getSortedIds(b.output_format_template);

    const languagesEqual =
      aLangIds.length === bLangIds.length && aLangIds.every((id, idx) => id === bLangIds[idx]);
    const outputsEqual =
      aOutIds.length === bOutIds.length && aOutIds.every((id, idx) => id === bOutIds[idx]);

    return (
      languagesEqual &&
      outputsEqual &&
      a.model_type === b.model_type
    );
  };

  const handleSavePreferencesAsDefault = async (checked: boolean) => {
    if (!checked) return;

    try {
      const response = await with401Retry(
        () =>
          sdkService.updateConfig({
            data: {
              auto_download: localPreferences.auto_download,
              input_languages: localPreferences.input_languages,
              consultation_mode: 'dictation',
              model_type: MODEL_TYPE.PRO,
              output_format_template: localPreferences.output_format_template,
              auto_detect_language: localPreferences.auto_detect_language,
              scribe_enabled: localPreferences.model_training_consent.value,
            },
            request_type: 'user',
          }),
        'update config - user defaults'
      );

      if (response.status_code >= 400) {
        toast.error(response.error?.message || 'Something went wrong. Please try again.');
        return;
      }

      setUserLevelPreferences(localPreferences);

      // Refetch the cached config
      await queryClient.invalidateQueries({ queryKey: getEkascribeConfigQueryKey() });
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  };

  const isFormValid =
    localPreferences.input_languages.length > 0 && localPreferences.model_type.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="fixed inset-0 bg-alpha-black-5" />
      <DialogContent className="w-full md:max-w-lg border-border">
        <DialogHeader className="text-left sm:text-left">
          <DialogTitle className="text-lg font-medium text-left">Edit Details</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-left">
            Make changes to your patient settings here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inputLanguages">Input Language(s)</Label>
            <MultiSelectInput
              options={[...appConfig.supported_languages].sort((a) =>
                a.id === 'auto_detect' ? -1 : 1
              )}
              selected={localPreferences.input_languages}
              onSelectionChange={handleLanguagesChange}
              placeholder="Select input languages"
              maxSelections={4}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="outputFormat">Output format(s)</Label>
            <SearchableCombobox
              options={userSelectedTemplatesList}
              value={localPreferences.output_format_template[0]?.id || ''}
              onSelectionChange={handleOutputFormatsChange}
              placeholder="Select output format"
              searchPlaceholder="Search templates..."
              emptyMessage="No options available."
            />
          </div>

          <DialogFooter className="pt-4">
            <div className="w-full flex gap-2 items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="save-preferences-as-default"
                  className="border-border cursor-pointer"
                  checked={arePreferencesEqual(userLevelPreferences, localPreferences)}
                  disabled={
                    !isFormValid || arePreferencesEqual(userLevelPreferences, localPreferences)
                  }
                  onCheckedChange={(checked) => handleSavePreferencesAsDefault(Boolean(checked))}
                />
                <Label
                  htmlFor="save-preferences-as-default"
                  className="text-xs text-secondary-foreground"
                >
                  Set as default
                </Label>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-border hover:bg-secondary hover:text-secondary-foreground cursor-pointer"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>

                <Button type="submit" className="cursor-pointer" disabled={!isFormValid}>
                  Save changes
                </Button>
              </div>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
