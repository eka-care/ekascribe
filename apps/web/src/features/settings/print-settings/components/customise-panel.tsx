'use client';

import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/src';
import { Printer } from 'lucide-react';
import UploadHeaderFooterTab from './upload-header-footer-tab';
import SimpleLayoutTab from './simple-layout-tab';
import type {
  PrintImageState,
  PrintSettingsState,
  PrintSettingsTab,
  SimpleLayoutState,
} from '@/features/settings/print-settings/hooks/use-print-settings';

type CustomisePanelProps = {
  state: PrintSettingsState;
  onEnabledChange: (enabled: boolean) => void;
  onActiveTabChange: (tab: PrintSettingsTab) => void;
  onHeaderChange: (updater: (prev: PrintImageState) => PrintImageState) => void;
  onFooterChange: (updater: (prev: PrintImageState) => PrintImageState) => void;
  onSimpleLayoutChange: (updater: (prev: SimpleLayoutState) => SimpleLayoutState) => void;
};

const CustomisePanel = ({
  state,
  onEnabledChange,
  onActiveTabChange,
  onHeaderChange,
  onFooterChange,
  onSimpleLayoutChange,
}: CustomisePanelProps) => {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 pb-0">
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-border -mx-4 px-4 pb-4">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold">Customise Print Settings</h2>
          <p className="text-xs sm:text-sm text-[#767676] mt-1">
            Configure how your prescriptions look when printed
          </p>
        </div>
        <Switch
          checked={state.enabled}
          onCheckedChange={onEnabledChange}
          className="shrink-0 w-11 h-6 *:data-[slot=switch-thumb]:size-5 *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-[calc(100%)] data-[state=unchecked]:bg-muted-foreground cursor-pointer"
        />
      </div>

      {state.enabled ? (
        <Tabs
          value={state.activeTab}
          onValueChange={(v) => onActiveTabChange(v as PrintSettingsTab)}
          className=""
        >
          <TabsList className="flex w-[calc(100%+2rem)] justify-start bg-transparent border-b border-border rounded-none p-0 -mx-4 px-4 h-auto gap-3 sm:gap-4 overflow-x-auto whitespace-nowrap">
            <TabsTrigger
              value="upload"
              className="border-0 border-b-2 border-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none px-1 py-1.5 text-xs sm:text-sm cursor-pointer bg-transparent shrink-0"
            >
              Upload Header &amp; Footer
            </TabsTrigger>
            <TabsTrigger
              value="simple-layout"
              className="border-0 border-b-2 border-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none px-1 py-1.5 text-xs sm:text-sm cursor-pointer bg-transparent shrink-0"
            >
              Simple Layout Control
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-2 mb-4">
            <UploadHeaderFooterTab
              header={state.header}
              footer={state.footer}
              onHeaderChange={onHeaderChange}
              onFooterChange={onFooterChange}
            />
          </TabsContent>

          <TabsContent value="simple-layout" className="mt-4">
            <SimpleLayoutTab
              layout={state.simpleLayout}
              onLayoutChange={onSimpleLayoutChange}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Printer className="w-6 h-6 text-[#767676]" />
          </div>
          <p className="text-base font-semibold">Custom print settings are off</p>
          <p className="text-sm text-[#767676] mt-1 max-w-sm">
            Prescriptions and Clinical Notes will print with the default layout.
          </p>
        </div>
      )}
    </div>
  );
};

export default CustomisePanel;
