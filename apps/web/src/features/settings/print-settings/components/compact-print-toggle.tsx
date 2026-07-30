'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Switch, Label } from '@ui/src';
import type { TPatchVoiceApiV2ConfigRequest } from '@eka-care/ekascribe-ts-sdk';
import useVoice2RxStore from '@/store/store';
import { updateConfig } from '@/features/session/services/sdk-service';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { broadcastPrintConfigUpdated } from '@/features/settings/print-settings/utils/print-config-broadcast';

const CompactPrintToggle = () => {
  const appConfig = useVoice2RxStore((state) => state.appConfig);
  const setAppConfig = useVoice2RxStore((state) => state.setAppConfig);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = useCallback(
    async (checked: boolean) => {
      const previous = appConfig;
      setAppConfig({ ...appConfig, print_compact: checked });
      setIsSaving(true);
      try {
        const res = await with401Retry(
          () =>
            updateConfig({
              request_type: 'user',
              data: { print_compact: checked },
            } as unknown as TPatchVoiceApiV2ConfigRequest),
          'update config - compact print'
        );
        if (res.status_code >= 200 && res.status_code < 300) {
          broadcastPrintConfigUpdated();
          toast.success(checked ? 'Compact print layout enabled' : 'Compact print layout disabled');
        } else {
          setAppConfig(previous);
          toast.error(res.error?.message || 'Failed to update compact print layout');
        }
      } catch {
        setAppConfig(previous);
        toast.error('Failed to update compact print layout');
      } finally {
        setIsSaving(false);
      }
    },
    [appConfig, setAppConfig]
  );

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="compact-print-toggle"
        checked={Boolean(appConfig.print_compact)}
        disabled={isSaving}
        onCheckedChange={handleChange}
        className="shrink-0 w-8 h-[18px] *:data-[slot=switch-thumb]:size-3.5 *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-4 data-[state=unchecked]:bg-muted-foreground cursor-pointer"
      />
      <Label htmlFor="compact-print-toggle" className="text-xs text-[#767676] cursor-pointer">
        Compact print layout
      </Label>
    </div>
  );
};

export default CompactPrintToggle;
