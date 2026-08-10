'use client';

import useVoice2RxStore from '@/store/store';
import { useSettings } from '@/features/settings/hooks/use-settings';
import { getEkascribeConfigQueryKey } from '@/features/settings/hooks/use-get-config';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  Sidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  DialogContent,
  Label,
  SidebarGroupContent,
  SidebarGroup,
  SidebarProvider,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
  BreadcrumbPage,
  Switch,
} from '@ui/src';
import PreferenceCard from '@/features/settings/components/preference-card';
import DesktopWidgetSettings, {
  useDesktopWidgetSettings,
} from '@/features/settings/components/desktop-widget-settings';
import WhatsAppSetupDialog from '@/features/settings/components/whatsapp-setup-dialog';
import DownloadDesktopApp from '@/features/settings/components/download-desktop-app';
import { MODEL_TYPE } from '@/constants/enums';
import { TUserSelectedPreferences } from '@/constants/types';
import { Sparkles, List, Cpu, MonitorCog } from 'lucide-react';
import MultiSelectInput from '@/shared-components/input/multi-select-input';
import React from 'react';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { toast } from 'sonner';
import { useCapabilities } from '@/platform';

type UserDefaultsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const UserDefaultsDialog = ({ open, onOpenChange }: UserDefaultsDialogProps) => {
  useSettings();

  const capabilities = useCapabilities();
  const appConfig = useVoice2RxStore((state) => state.appConfig);
  const userSelectedTemplatesList = useVoice2RxStore((state) => state.userSelectedTemplatesList);
  const userLevelPreferences = useVoice2RxStore((state) => state.userLevelPreferences);
  const setUserLevelPreferences = useVoice2RxStore((state) => state.setUserLevelPreferences);
  const queryClient = useQueryClient();

  const [localPreferences, setLocalPreferences] = useState<TUserSelectedPreferences>({
    input_languages: [],
    output_format_template: [],
    consultation_mode: '',
    model_type: MODEL_TYPE.PRO,
    use_audio_cues: false,
    auto_download: false,
    auto_detect_language: false,
    model_training_consent: { value: true, editable: false },
  });

  useEffect(() => {
    if (open && userLevelPreferences) {
      setLocalPreferences(userLevelPreferences);
    }
  }, [open, userLevelPreferences]);

  const [settingsPage, setSettingsPage] = useState<'user-defaults' | 'desktop-widget'>(
    'user-defaults'
  );

  const {
    componentProps: desktopWidgetProps,
    isSavingShortcut,
    canSaveShortcut,
    handleSaveShortcut,
    cancelListening,
  } = useDesktopWidgetSettings(() => handleOpenChange(false));

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) cancelListening();
    onOpenChange(nextOpen);
  };

  const [isWhatsAppSetupOpen, setIsWhatsAppSetupOpen] = useState(false);

  const handleConnectWhatsApp = () => {
    setIsWhatsAppSetupOpen(true);
  };

  const getBreadcrumbItems = () => {
    const items = [{ label: 'Settings', isCurrentPage: false }];

    const pageLabelMap: Record<typeof settingsPage, string> = {
      'user-defaults': 'User Defaults',
      'desktop-widget': 'Desktop Widget',
    };

    items.push({ label: pageLabelMap[settingsPage], isCurrentPage: true });
    return items;
  };

  const handleUpdateUserDefaults = async () => {
    const updateConfigResponse = await updateUserPreferences({
      userSelectedPreferences: localPreferences,
    });

    const { status_code: statusCode, error } = updateConfigResponse;

    if (statusCode >= 400) {
      toast.error(error?.message || 'Something went wrong. Please try again.');
      return;
    }

    setUserLevelPreferences(localPreferences);

    // Refetch the cached config
    await queryClient.invalidateQueries({ queryKey: getEkascribeConfigQueryKey() });

    toast.success('User defaults updated successfully');
    window.postMessage({ source: 'scribe-web', type: 'USER_DEFAULTS_UPDATED' }, '*');

    handleOpenChange(false);
    return;
  };

  const handleLanguagesChange = (selected: TUserSelectedPreferences['input_languages']) => {
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

  const isFormValid =
    localPreferences.input_languages.length > 0 && localPreferences.model_type.length > 0;

  const hasUnsavedChanges =
    !!userLevelPreferences &&
    JSON.stringify(localPreferences) !== JSON.stringify(userLevelPreferences);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* <DialogOverlay className="fixed inset-0 bg-alpha-black-5" /> */}
      <DialogContent className="w-full md:max-w-4xl border-border p-0 h-[calc(100vh-16rem)] overflow-hidden">
        <SidebarProvider className="h-full min-h-0">
          <Sidebar className="border-none h-full overflow-y-auto">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={`${
                        settingsPage === 'user-defaults'
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'bg-transparent text-foreground'
                      } cursor-pointer`}
                      onClick={() => setSettingsPage('user-defaults')}
                    >
                      <List className="w-4 h-4" />
                      <span>User Defaults</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={`${
                        settingsPage === 'desktop-widget'
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'bg-transparent text-foreground'
                      } cursor-pointer`}
                      onClick={() => setSettingsPage('desktop-widget')}
                    >
                      <MonitorCog className="w-4 h-4" />
                      <span>Desktop Widget</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </Sidebar>

          <section className="flex flex-col w-full h-full p-4 gap-4">
            <div className="flex items-center overflow-hidden">
              <Breadcrumb>
                <BreadcrumbList>
                  {getBreadcrumbItems().map((item, index, arr) => (
                    <React.Fragment key={`${item.label}-${index}`}>
                      <BreadcrumbItem>
                        {item.isCurrentPage ? (
                          <BreadcrumbPage className="text-sm leading-5">
                            {item.label}
                          </BreadcrumbPage>
                        ) : (
                          <span className="text-sm text-[#767676] leading-5">{item.label}</span>
                        )}
                      </BreadcrumbItem>
                      {index < arr.length - 1 && <BreadcrumbSeparator />}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {settingsPage === 'user-defaults' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start overflow-y-auto h-full py-1">
                <PreferenceCard
                  CardIcon={<Sparkles className="w-4 h-4" />}
                  title="Speech Recognition"
                  description="Choose your default input languages for speech recognition. You can still override this per session."
                >
                  <div className="space-y-2">
                    <Label className="text-sm font-medium leading-5">
                      Default Input Language(s)
                    </Label>
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
                </PreferenceCard>

                <PreferenceCard
                  CardIcon={<Sparkles className="w-4 h-4" />}
                  title="Default Output Format(s)"
                  description="Choose your default output formats for note generation. You can still override this per session."
                >
                  <div className="space-y-2">
                    <Label className="text-sm font-medium leading-5">
                      Default Output Format(s)
                    </Label>
                    <MultiSelectInput
                      options={userSelectedTemplatesList}
                      selected={localPreferences.output_format_template}
                      onSelectionChange={(selected) => {
                        setLocalPreferences((prev) => ({
                          ...prev,
                          output_format_template: selected,
                        }));
                      }}
                      placeholder="Select output formats"
                      maxSelections={1}
                    />
                  </div>
                </PreferenceCard>

                <PreferenceCard
                  CardIcon={<Cpu className="w-4 h-4" />}
                  title="Help us make the model better"
                  description="Share anonymized data for model training & research purposes."
                >
                  <div className="space-y-2">
                    <Switch
                      defaultChecked={localPreferences.model_training_consent.value}
                      disabled={!localPreferences.model_training_consent.editable}
                      onCheckedChange={(checked) => {
                        setLocalPreferences((prev) => ({
                          ...prev,
                          model_training_consent: {
                            ...prev.model_training_consent,
                            value: checked,
                          },
                        }));
                      }}
                      className="shrink-0 w-11 h-6 *:data-[slot=switch-thumb]:size-5 *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-[calc(100%)] data-[state=unchecked]:bg-muted-foreground cursor-pointer"
                    />
                  </div>
                </PreferenceCard>
              </div>
            )}

            {settingsPage === 'desktop-widget' &&
              (capabilities.has('desktop-settings') ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start overflow-y-auto h-full py-1">
                  <DesktopWidgetSettings
                    {...desktopWidgetProps}
                    onConnectWhatsApp={handleConnectWhatsApp}
                  />
                </div>
              ) : (
                <DownloadDesktopApp />
              ))}

            {settingsPage === 'user-defaults' && (
              <div className="flex justify-end items-center gap-2">
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="cursor-pointer"
                  disabled={!isFormValid || !hasUnsavedChanges}
                  onClick={handleUpdateUserDefaults}
                >
                  Save changes
                </Button>
              </div>
            )}

            {settingsPage === 'desktop-widget' && capabilities.has('desktop-settings') && (
              <div className="flex justify-end items-center gap-2">
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="cursor-pointer"
                  disabled={!canSaveShortcut}
                  onClick={handleSaveShortcut}
                >
                  {isSavingShortcut ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            )}
          </section>
        </SidebarProvider>
      </DialogContent>
      <WhatsAppSetupDialog open={isWhatsAppSetupOpen} onOpenChange={setIsWhatsAppSetupOpen} />
    </Dialog>
  );
};

export const updateUserPreferences = async ({
  userSelectedPreferences,
}: {
  userSelectedPreferences: TUserSelectedPreferences;
}) => {
  const updateConfigResponse = await with401Retry(
    () =>
      getSDK().sessions.updateConfig({
        data: {
          auto_download: userSelectedPreferences.auto_download,
          input_languages: userSelectedPreferences.input_languages,
          consultation_mode: 'dictation',
          model_type: userSelectedPreferences.model_type,
          output_format_template: userSelectedPreferences.output_format_template,
          auto_detect_language: userSelectedPreferences.auto_detect_language,
          scribe_enabled: userSelectedPreferences.model_training_consent.value,
        },
        request_type: 'user',
      }),
    'update config - user defaults'
  );

  return updateConfigResponse;
};

export default UserDefaultsDialog;
