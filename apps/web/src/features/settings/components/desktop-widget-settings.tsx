'use client';

import { Card, CardContent, CardHeader, Label, Switch } from '@ui/src';
import { AlertTriangle, ArrowRight, MessageSquare, MonitorCog } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import PreferenceCard from '@/features/settings/components/preference-card';
import SingleSelectInput from '@/shared-components/input/single-select-input';
import WhatsAppIcon from '@/features/integrations/components/whatsapp-icon';
import { useDesktopSettings, useWhatsApp } from '@/platform';

export type NotificationPrefs = {
  joinVideoConferencingAndStartTranscribing: boolean;
  meetingIsBeingRecorded: boolean;
  meetingIsSummarized: boolean;
};

export type NotificationPrefKey = keyof NotificationPrefs;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  joinVideoConferencingAndStartTranscribing: true,
  meetingIsBeingRecorded: true,
  meetingIsSummarized: true,
};

export type Platform = 'mac' | 'windows' | 'other';

export function detectPlatform(): Platform {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('win')) return 'windows';
  return 'other';
}

export function getDefaultPreset(platform: Platform): string {
  return platform === 'windows' ? 'Alt + S' : 'Ctrl + S';
}

export function getPresets(platform: Platform): readonly string[] {
  return [getDefaultPreset(platform)];
}

export const OS_RESERVED_BY_PLATFORM: Record<Platform, Set<string>> = {
  mac: new Set([
    'Cmd + Space', 'Cmd + Tab', 'Cmd + Q', 'Cmd + W', 'Cmd + M', 'Cmd + H',
    'Cmd + C', 'Cmd + V', 'Cmd + X', 'Cmd + Z', 'Cmd + Shift + Z',
    'Cmd + A', 'Cmd + P', 'Cmd + F', 'Cmd + N', 'Cmd + O', 'Cmd + T',
  ]),
  windows: new Set([
    'Alt + Tab', 'Alt + F4', 'Ctrl + Esc', 'Ctrl + C', 'Ctrl + V', 'Ctrl + X',
    'Ctrl + Z', 'Ctrl + Y', 'Ctrl + A', 'Ctrl + P', 'Ctrl + F', 'Ctrl + N',
    'Ctrl + O', 'Ctrl + T',
  ]),
  other: new Set(),
};

export function resolveKey(e: KeyboardEvent): string {
  const useCode = e.altKey || e.key === 'Dead' || e.key === 'Unidentified';
  if (useCode) {
    if (/^Key([A-Z])$/.test(e.code)) return e.code.slice(3);
    if (/^Digit(\d)$/.test(e.code)) return e.code.slice(5);
    if (/^F(\d+)$/.test(e.code)) return e.code;
    const codeMap: Record<string, string> = {
      Space: 'Space', Minus: '-', Equal: '=', BracketLeft: '[',
      BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
      Backquote: '`', Comma: ',', Period: '.', Slash: '/',
    };
    if (codeMap[e.code]) return codeMap[e.code];
    return e.code;
  }
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

export function validateHotkey(
  modifiers: string[],
  key: string,
  platform: Platform,
): string | null {
  if (modifiers.length !== 1) {
    return 'Shortcut must be exactly two keys: one modifier and one main key.';
  }
  const combo = [...modifiers, key].join(' + ');
  if (OS_RESERVED_BY_PLATFORM[platform].has(combo)) {
    return 'This combination is reserved by the operating system and cannot be used.';
  }
  return null;
}

const SWITCH_CLASS =
  'shrink-0 w-11 h-6 *:data-[slot=switch-thumb]:size-5 *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-[calc(100%)] data-[state=unchecked]:bg-muted-foreground cursor-pointer';

const WIDGET_ROWS: {
  key: NotificationPrefKey;
  label: string;
  description: string;
  isLast?: boolean;
}[] = [
  {
    key: 'joinVideoConferencingAndStartTranscribing',
    label: 'Start session',
    description: 'The start prompt cannot be disabled.',
  },
  {
    key: 'meetingIsBeingRecorded',
    label: 'Recording',
    description: 'Live timer and controls while a session is in progress.',
  },
  {
    key: 'meetingIsSummarized',
    label: 'Session complete',
    description: 'Notification when your note is ready to view.',
    isLast: true,
  },
];

type WhatsAppAutoSendPrefs = {
  send_via_linked_device: boolean;
  auto_send_rate_limit: number;
  allow_partner_emr_auto_send: boolean;
};

const DEFAULT_WHATSAPP_PREFS: WhatsAppAutoSendPrefs = {
  send_via_linked_device: true,
  auto_send_rate_limit: 1,
  allow_partner_emr_auto_send: true,
};

export function useDesktopWidgetSettings(onClose: () => void) {
  const desktopSettings = useDesktopSettings();
  const whatsapp = useWhatsApp();

  const [platform] = useState<Platform>(() => detectPlatform());
  const defaultPreset = getDefaultPreset(platform);
  const presets = getPresets(platform);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [hotkeyTab, setHotkeyTab] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState(defaultPreset);
  const [customKey, setCustomKey] = useState(defaultPreset);
  const [customKeyError, setCustomKeyError] = useState<string | null>(null);
  const [hotkeyEnabled, setHotkeyEnabled] = useState(true);
  const [isListeningForKey, setIsListeningForKey] = useState(false);
  const [savedShortcutEnabled, setSavedShortcutEnabled] = useState(true);
  const [savedShortcut, setSavedShortcut] = useState(defaultPreset);
  const [isSavingShortcut, setIsSavingShortcut] = useState(false);
  const [whatsAppPrefs, setWhatsAppPrefs] = useState<WhatsAppAutoSendPrefs>(DEFAULT_WHATSAPP_PREFS);
  const [whatsAppStatus, setWhatsAppStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const load = async () => {
      try {
        if (!desktopSettings) return;
        const [loadedPrefs, loadedShortcut, loadedWhatsApp, waStatus] = await Promise.all([
          desktopSettings.getNotificationPreferences(),
          desktopSettings.getShortcutPreferences().catch((error: unknown) => {
            console.error('[Settings] failed to load shortcut preferences', error);
            return null;
          }),
          desktopSettings.getWhatsAppAutoSendPrefs().catch(() => null),
          whatsapp?.getStatus().catch(() => null),
        ]);
        if (!isMountedRef.current) return;
        if (loadedPrefs) setPrefs(loadedPrefs);
        if (loadedWhatsApp) setWhatsAppPrefs(loadedWhatsApp);
        if (waStatus?.status) setWhatsAppStatus(waStatus.status as 'connected' | 'connecting' | 'disconnected');
        if (loadedShortcut) {
          const combo =
            typeof loadedShortcut.shortcut === 'string' &&
            loadedShortcut.shortcut.trim().length > 0
              ? loadedShortcut.shortcut.trim()
              : defaultPreset;
          const enabled = loadedShortcut.enabled !== false;
          setHotkeyEnabled(enabled);
          setSavedShortcutEnabled(enabled);
          setSavedShortcut(combo);
          if (presets.includes(combo)) {
            setHotkeyTab('preset');
            setSelectedPreset(combo);
            setCustomKey(combo);
          } else {
            setHotkeyTab('custom');
            setCustomKey(combo);
            setSelectedPreset(defaultPreset);
          }
        }
      } catch (error) {
        console.error('[Settings] failed to load notification preferences', error);
      }
    };
    load();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isListeningForKey) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.metaKey) modifiers.push('Cmd');
      const mainKey = resolveKey(e);
      setCustomKey([...modifiers, mainKey].join(' + '));
      setCustomKeyError(validateHotkey(modifiers, mainKey, platform));
      setIsListeningForKey(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListeningForKey, platform]);

  const togglePref = useCallback((key: NotificationPrefKey) => {
    setPrefs((previous) => {
      const nextValue = !previous[key];
      const optimistic: NotificationPrefs = { ...previous, [key]: nextValue };
      desktopSettings
        ?.updateNotificationPreferences({ [key]: nextValue })
        .then((resolved: NotificationPrefs | null) => {
          if (!isMountedRef.current || !resolved) return;
          setPrefs(resolved);
        })
        .catch(() => {
          if (!isMountedRef.current) return;
          setPrefs(previous);
        });
      return optimistic;
    });
  }, [desktopSettings]);

  useEffect(() => {
    if (!desktopSettings) return;
    const unsub = desktopSettings.onWhatsAppPrefsUpdated((prefs: WhatsAppAutoSendPrefs) => {
      if (isMountedRef.current) setWhatsAppPrefs(prefs);
    });
    return () => unsub?.();
  }, [desktopSettings]);

  useEffect(() => {
    if (!whatsapp) return;
    const unsub = whatsapp.onStatusChange?.((status: string) => {
      if (!isMountedRef.current) return;
      setWhatsAppStatus(status as 'connected' | 'connecting' | 'disconnected');
      if (status === 'disconnected') {
        const cleared = { send_via_linked_device: false, allow_partner_emr_auto_send: false };
        setWhatsAppPrefs((prev) => ({ ...prev, ...cleared }));
        desktopSettings?.updateWhatsAppAutoSendPrefs(cleared)?.catch(() => {});
      }
      if (status === 'connected') {
        const defaults = { send_via_linked_device: true, allow_partner_emr_auto_send: true };
        setWhatsAppPrefs((prev) => ({ ...prev, ...defaults }));
        desktopSettings?.updateWhatsAppAutoSendPrefs(defaults)?.catch(() => {});
      }
    });
    return () => unsub?.();
  }, [whatsapp, desktopSettings]);

  const handleWhatsAppPrefChange = useCallback((partial: Partial<WhatsAppAutoSendPrefs>) => {
    let snapshot: WhatsAppAutoSendPrefs | undefined;
    setWhatsAppPrefs((prev) => {
      snapshot = prev;
      return { ...prev, ...partial };
    });
    desktopSettings?.updateWhatsAppAutoSendPrefs(partial)
      ?.then((resolved: WhatsAppAutoSendPrefs) => {
        if (isMountedRef.current) setWhatsAppPrefs(resolved);
      })
      ?.catch(() => {
        if (isMountedRef.current && snapshot) setWhatsAppPrefs(snapshot);
      });
  }, [desktopSettings]);

  const handleEnableHotkey = () => setHotkeyEnabled((prev) => !prev);

  const handleResetToDefault = useCallback(() => {
    setCustomKey(defaultPreset);
    setCustomKeyError(null);
    setHotkeyTab('preset');
    setSelectedPreset(defaultPreset);
    setIsListeningForKey(false);
  }, [defaultPreset]);

  const currentDraftShortcut = hotkeyTab === 'preset' ? selectedPreset : customKey;
  const shortcutHasChanges =
    savedShortcutEnabled !== hotkeyEnabled || savedShortcut !== currentDraftShortcut;
  const canSaveShortcut =
    !isSavingShortcut &&
    (hotkeyTab === 'preset' || (!isListeningForKey && customKeyError === null));

  const handleSaveShortcut = useCallback(async () => {
    if (isSavingShortcut || (hotkeyTab === 'custom' && customKeyError !== null)) return;
    if (!shortcutHasChanges) {
      onClose();
      return;
    }
    setIsSavingShortcut(true);
    try {
      const result = await desktopSettings?.updateShortcutPreferences({
        enabled: hotkeyEnabled,
        shortcut: currentDraftShortcut,
      });
      if (!isMountedRef.current) return;
      const resolvedShortcut =
        typeof result?.shortcut === 'string' && result.shortcut.trim().length > 0
          ? result.shortcut.trim()
          : currentDraftShortcut;
      setSavedShortcut(resolvedShortcut);
      setSavedShortcutEnabled(result?.enabled ?? hotkeyEnabled);
      setIsSavingShortcut(false);
      onClose();
    } catch (error) {
      console.error('[Settings] failed to save shortcut preferences', error);
      if (isMountedRef.current) setIsSavingShortcut(false);
    }
  }, [
    currentDraftShortcut,
    customKeyError,
    desktopSettings,
    hotkeyEnabled,
    hotkeyTab,
    isSavingShortcut,
    onClose,
    shortcutHasChanges,
  ]);

  return {
    componentProps: {
      hotkeyEnabled,
      onHotkeyEnabledChange: handleEnableHotkey,
      hotkeyTab,
      onHotkeyTabChange: setHotkeyTab,
      selectedPreset,
      presets,
      onSelectedPresetChange: setSelectedPreset,
      customKey,
      customKeyError,
      isListeningForKey,
      onStartListening: () => {
        setIsListeningForKey(true);
        setCustomKeyError(null);
      },
      onResetToDefault: handleResetToDefault,
      prefs,
      onTogglePref: togglePref,
      whatsAppPrefs,
      whatsAppStatus,
      onWhatsAppPrefChange: handleWhatsAppPrefChange,
    },
    isSavingShortcut,
    canSaveShortcut,
    handleSaveShortcut,
    cancelListening: () => setIsListeningForKey(false),
  };
}

type DesktopWidgetSettingsProps = {
  hotkeyEnabled: boolean;
  onHotkeyEnabledChange: () => void;
  hotkeyTab: 'preset' | 'custom';
  onHotkeyTabChange: (tab: 'preset' | 'custom') => void;
  selectedPreset: string;
  presets: readonly string[];
  onSelectedPresetChange: (preset: string) => void;
  customKey: string;
  customKeyError: string | null;
  isListeningForKey: boolean;
  onStartListening: () => void;
  onResetToDefault: () => void;
  prefs: NotificationPrefs;
  onTogglePref: (key: NotificationPrefKey) => void;
  whatsAppPrefs: WhatsAppAutoSendPrefs;
  whatsAppStatus: 'connected' | 'connecting' | 'disconnected';
  onWhatsAppPrefChange: (partial: Partial<WhatsAppAutoSendPrefs>) => void;
  onConnectWhatsApp?: () => void;
};

const DesktopWidgetSettings = ({
  hotkeyEnabled,
  onHotkeyEnabledChange,
  hotkeyTab,
  onHotkeyTabChange,
  selectedPreset,
  presets,
  onSelectedPresetChange,
  customKey,
  customKeyError,
  isListeningForKey,
  onStartListening,
  onResetToDefault,
  prefs,
  onTogglePref,
  whatsAppPrefs,
  whatsAppStatus,
  onWhatsAppPrefChange,
  onConnectWhatsApp,
}: DesktopWidgetSettingsProps) => {
  const [isCustomKeyHovered, setIsCustomKeyHovered] = useState(false);
  const [rateLimitDraft, setRateLimitDraft] = useState<string>(
    String(whatsAppPrefs.auto_send_rate_limit),
  );

  useEffect(() => {
    const parsed = parseInt(rateLimitDraft, 10);
    if (parsed !== whatsAppPrefs.auto_send_rate_limit) {
      setRateLimitDraft(String(whatsAppPrefs.auto_send_rate_limit));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsAppPrefs.auto_send_rate_limit]);

  const commitRateLimit = () => {
    const parsed = parseInt(rateLimitDraft, 10);
    const clamped = isNaN(parsed)
      ? whatsAppPrefs.auto_send_rate_limit
      : Math.min(5, Math.max(1, parsed));
    setRateLimitDraft(String(clamped));
    if (clamped !== whatsAppPrefs.auto_send_rate_limit) {
      onWhatsAppPrefChange({ auto_send_rate_limit: clamped });
    }
  };

  return (
    <>
      <div className="col-span-2">
        <PreferenceCard
          CardIcon={<MessageSquare className="w-4 h-4" />}
          title="WhatsApp Auto Send"
          description="Configure sending prescriptions and patient documents through WhatsApp after consultation completion."
        >
          {whatsAppStatus !== 'connected' && (
            <div className="rounded-lg bg-[#ecfdf4] border border-[#008055]/30 px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(to top, #20b038, #60d66a)' }}
                >
                  <WhatsAppIcon className="w-4 h-4 text-white" />
                </div>
                <p className="text-xs text-[#1a1a1a]">Connect WhatsApp to enable auto-send features.</p>
              </div>
              {onConnectWhatsApp && (
                <button
                  onClick={onConnectWhatsApp}
                  className="text-xs font-medium text-[#008055] flex items-center gap-1 cursor-pointer bg-transparent border-none p-0 hover:underline shrink-0"
                >
                  Connect now
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between py-3.5 border-b border-muted">
            <div className="pr-4">
              <Label className="text-sm font-medium leading-5">Send via WhatsApp</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable Send via WhatsApp on EkaScribe Desktop App</p>
              <p className="text-xs text-muted-foreground">(Enabled by default)</p>
            </div>
            <Switch
              checked={whatsAppStatus === 'connected' && whatsAppPrefs.send_via_linked_device}
              disabled={whatsAppStatus !== 'connected'}
              onCheckedChange={(checked) => onWhatsAppPrefChange({ send_via_linked_device: checked })}
              className={SWITCH_CLASS}
            />
          </div>
          <div className="flex items-center justify-between py-3.5">
            <div className="pr-4">
              <Label className="text-sm font-medium leading-5">Allow Auto Send on Partner EMR/EHR</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable automatic WhatsApp sending for consultations completed through connected EMR/EHR systems.</p>
            </div>
            <Switch
              checked={whatsAppStatus === 'connected' && whatsAppPrefs.allow_partner_emr_auto_send}
              disabled={whatsAppStatus !== 'connected'}
              onCheckedChange={(checked) => onWhatsAppPrefChange({ allow_partner_emr_auto_send: checked })}
              className={SWITCH_CLASS}
            />
          </div>
          {whatsAppStatus === 'connected' && whatsAppPrefs.allow_partner_emr_auto_send && (
            <div className="pt-1 pb-3.5 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium leading-5 whitespace-nowrap">Rate limit</Label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rateLimitDraft}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, '');
                    setRateLimitDraft(digitsOnly);
                  }}
                  onBlur={commitRateLimit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-14 px-2.5 py-1.5 text-sm text-center border border-border rounded-md"
                />
                <span className="text-xs text-muted-foreground">messages per minute (max 5)</span>
              </div>
              <p className="text-xs text-amber-600 leading-relaxed flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Increasing this limit raises the risk of your WhatsApp account being flagged by Meta for unauthorized automation. Keep it low.
              </p>
            </div>
          )}
        </PreferenceCard>
      </div>

      <div className="col-span-2">
        <Card className="border-border py-4 w-full">
          <CardHeader className="px-4 gap-0">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                  <MonitorCog className="w-4 h-4" />
                  <p className="font-semibold text-sm leading-5">Quick access shortcut</p>
                </div>
                <div className="text-xs text-muted-foreground leading-4">
                  Trigger the EkaScribe widget from anywhere on your desktop
                </div>
              </div>
              <Switch
                checked={hotkeyEnabled}
                onCheckedChange={onHotkeyEnabledChange}
                className={SWITCH_CLASS}
              />
            </div>
          </CardHeader>
          <CardContent className="px-4">
            <div className={hotkeyEnabled ? '' : 'opacity-40 pointer-events-none select-none'}>
              <div className="flex border-b border-border mb-3">
                {(['preset', 'custom'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => onHotkeyTabChange(tab)}
                    className={`px-4 py-2 text-sm -mb-px border-b-2 cursor-pointer bg-transparent ${
                      hotkeyTab === tab
                        ? 'border-primary font-semibold text-foreground'
                        : 'border-transparent text-muted-foreground'
                    }`}
                  >
                    {tab === 'preset' ? 'Use a preset' : 'Set a custom key'}
                  </button>
                ))}
              </div>

              {hotkeyTab === 'custom' && (
                <div>
                  <div
                    onClick={onStartListening}
                    onMouseEnter={() => setIsCustomKeyHovered(true)}
                    onMouseLeave={() => setIsCustomKeyHovered(false)}
                    className={`flex items-center justify-between rounded-md px-3.5 h-9 max-h-10 text-sm cursor-pointer border transition-colors ${
                      customKeyError
                        ? 'border-destructive'
                        : isListeningForKey
                          ? 'border-primary bg-primary/5'
                          : isCustomKeyHovered
                            ? 'bg-muted/30 border-border'
                            : 'border-border'
                    }`}
                  >
                    <span className={customKeyError ? 'text-destructive' : ''}>{customKey}</span>
                    <span
                      className={`text-xs ${
                        isListeningForKey ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {isListeningForKey ? 'Press your desired key combination' : 'Click to change'}
                    </span>
                  </div>
                  {customKeyError && (
                    <p className="mt-1.5 text-xs text-destructive leading-snug">{customKeyError}</p>
                  )}
                  {!isListeningForKey && (
                    <button
                      onClick={onResetToDefault}
                      className="mt-2 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      Reset to default
                    </button>
                  )}
                </div>
              )}

              {hotkeyTab === 'preset' && (
                <SingleSelectInput
                  name="preset"
                  value={selectedPreset}
                  options={presets.map((p) => ({ id: p, name: p }))}
                  onSelectionChange={onSelectedPresetChange}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="col-span-2">
        <PreferenceCard
          CardIcon={<MonitorCog className="w-4 h-4" />}
          title="Floating widget visibility"
          description="The widget appears automatically at each stage of a scribe session. Disable it for stages where you don't need the interruption — the session will continue running in the background."
        >
          {WIDGET_ROWS.map(({ key, label, description, isLast }) => (
            <div
              key={key}
              className={`flex items-center justify-between py-3.5 ${
                isLast ? '' : 'border-b border-muted'
              }`}
            >
              <div className="pr-4">
                <Label className="text-sm font-medium leading-5">{label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
              <Switch
                checked={prefs[key]}
                onCheckedChange={() => onTogglePref(key)}
                className={SWITCH_CLASS}
              />
            </div>
          ))}
        </PreferenceCard>
      </div>
    </>
  );
};

export default DesktopWidgetSettings;
