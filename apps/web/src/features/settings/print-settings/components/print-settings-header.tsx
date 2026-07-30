'use client';

import { Button } from '@ui/src';

type PrintSettingsHeaderProps = {
  isSaving: boolean;
  isDirty: boolean;
  onCancel: () => void;
  onSave: () => void;
};

const PrintSettingsHeader = ({
  isSaving,
  isDirty,
  onCancel,
  onSave,
}: PrintSettingsHeaderProps) => {
  return (
    <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border bg-background shrink-0">
      <nav className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm min-w-0">
        <span className="text-[#767676] hidden sm:inline">Settings</span>
        <span className="text-[#767676] hidden sm:inline">›</span>
        <span className="font-medium truncate">Customise Print Settings</span>
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="cursor-pointer"
          onClick={onSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </header>
  );
};

export default PrintSettingsHeader;
