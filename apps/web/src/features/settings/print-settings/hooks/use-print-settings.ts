'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { TPatchVoiceApiV2ConfigRequest } from '@eka-care/ekascribe-ts-sdk';
import {
  HEADER_HEIGHT_RANGE_CM,
  FOOTER_HEIGHT_RANGE_CM,
  SIMPLE_LAYOUT_DEFAULTS_CM,
} from '@/features/settings/print-settings/config/print-settings-config';
import { updateConfig } from '@/features/session/services/sdk-service';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import {
  buildPrintConfigPayload,
  buildStateFromConfig,
} from '@/features/settings/print-settings/utils/print-config-payload';
import { broadcastPrintConfigUpdated } from '@/features/settings/print-settings/utils/print-config-broadcast';
import type { TPrintConfigSection } from '@/constants/types';

export type PrintSettingsTab = 'upload' | 'simple-layout';

export type PercentCropValue = {
  unit: '%';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PrintImageState = {
  originalImage: string | null;
  croppedImage: string | null;
  savedCrop: PercentCropValue | null;
  heightCm: number;
};

export type SimpleLayoutState = {
  headerSpaceCm: number;
  footerSpaceCm: number;
};

export type PrintSettingsState = {
  enabled: boolean;
  activeTab: PrintSettingsTab;
  header: PrintImageState;
  footer: PrintImageState;
  simpleLayout: SimpleLayoutState;
};

const INITIAL_STATE: PrintSettingsState = {
  enabled: true,
  activeTab: 'upload',
  header: {
    originalImage: null,
    croppedImage: null,
    savedCrop: null,
    heightCm: HEADER_HEIGHT_RANGE_CM.default,
  },
  footer: {
    originalImage: null,
    croppedImage: null,
    savedCrop: null,
    heightCm: FOOTER_HEIGHT_RANGE_CM.default,
  },
  simpleLayout: {
    headerSpaceCm: SIMPLE_LAYOUT_DEFAULTS_CM.header,
    footerSpaceCm: SIMPLE_LAYOUT_DEFAULTS_CM.footer,
  },
};

export function usePrintSettings() {
  const [state, setState] = useState<PrintSettingsState>(INITIAL_STATE);
  const [baseline, setBaseline] = useState<PrintSettingsState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await with401Retry(
          () => getSDK().sessions.getConfig(),
          'get config - print settings'
        );
        if (cancelled) return;
        const data = res.data as
          | { header?: TPrintConfigSection; footer?: TPrintConfigSection }
          | undefined;
        const hydrated =
          data && (data.header || data.footer)
            ? buildStateFromConfig(data.header, data.footer)
            : INITIAL_STATE;
        setState(hydrated);
        setBaseline(hydrated);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, enabled }));
  }, []);

  const setActiveTab = useCallback((activeTab: PrintSettingsTab) => {
    setState((prev) => ({ ...prev, activeTab }));
  }, []);

  const setHeader = useCallback((updater: (prev: PrintImageState) => PrintImageState) => {
    setState((prev) => ({ ...prev, header: updater(prev.header) }));
  }, []);

  const setFooter = useCallback((updater: (prev: PrintImageState) => PrintImageState) => {
    setState((prev) => ({ ...prev, footer: updater(prev.footer) }));
  }, []);

  const setSimpleLayout = useCallback(
    (updater: (prev: SimpleLayoutState) => SimpleLayoutState) => {
      setState((prev) => ({ ...prev, simpleLayout: updater(prev.simpleLayout) }));
    },
    []
  );

  const saveConfig = useCallback(async () => {
    setIsSaving(true);
    try {
      let payload;
      try {
        payload = await buildPrintConfigPayload(state);
      } catch {
        toast.error('Could not read existing image. Use Change to re-upload.');
        return false;
      }
      const res = await with401Retry(
        () => updateConfig(payload as unknown as TPatchVoiceApiV2ConfigRequest),
        'update config - print settings'
      );
      if (res.status_code >= 200 && res.status_code < 300) {
        setBaseline(state);
        broadcastPrintConfigUpdated();
        toast.success('Print settings saved');
        return true;
      }
      toast.error(res.error?.message || 'Failed to save print settings');
      return false;
    } catch (err) {
      toast.error('Failed to save print settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [state]);

  const isDirty = JSON.stringify(state) !== JSON.stringify(baseline);

  return {
    state,
    isLoading,
    isSaving,
    isDirty,
    setEnabled,
    setActiveTab,
    setHeader,
    setFooter,
    setSimpleLayout,
    saveConfig,
  };
}
