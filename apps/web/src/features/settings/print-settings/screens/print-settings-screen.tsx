'use client';

import { useRouter } from 'next/navigation';
import PrintSettingsHeader from '../components/print-settings-header';
import A4Preview from '../components/a4-preview';
import CustomisePanel from '../components/customise-panel';
import { usePrintSettings } from '../hooks/use-print-settings';

const PrintSettingsScreen = () => {
  const router = useRouter();
  const {
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
  } = usePrintSettings();

  const handleCancel = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      window.close();
    }
  };

  const handleSave = async () => {
    await saveConfig();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-secondary text-sm text-muted-foreground">
        Loading print settings…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-secondary">
      <PrintSettingsHeader
        isSaving={isSaving}
        isDirty={isDirty}
        onCancel={handleCancel}
        onSave={handleSave}
      />

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:overflow-hidden overflow-y-auto">
        <section className="flex-none lg:flex-1 lg:overflow-y-auto p-4 sm:p-6 flex items-start justify-center bg-secondary">
          <A4Preview state={state} />
        </section>
        <aside className="w-full lg:max-w-[640px] border-t lg:border-t-0 lg:border-l border-border bg-background lg:h-full lg:overflow-y-auto">
          <CustomisePanel
            state={state}
            onEnabledChange={setEnabled}
            onActiveTabChange={setActiveTab}
            onHeaderChange={setHeader}
            onFooterChange={setFooter}
            onSimpleLayoutChange={setSimpleLayout}
          />
        </aside>
      </div>
    </div>
  );
};

export default PrintSettingsScreen;
