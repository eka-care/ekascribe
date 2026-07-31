import * as React from 'react';
import { cn } from '@/lib/utils';
import { CustomInput } from './custom-input';

export interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: any) => void;
  placeholder?: string;
  containerClassName?: string;
  inputStyle?: React.CSSProperties;
  inputClassName?: string;
  customSuggestions: React.ComponentType<{
    searchValue: string;
    onSelect: (item: any) => void;
    onAddNew?: (value: string) => void;
  }>;
  onAddNew?: (value: string) => void;
  disabled?: boolean;
  leftComponent?: React.ReactNode;
  rightComponent?: React.ReactNode;
}

export function AutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Type to search...',
  containerClassName,
  inputClassName,
  inputStyle,
  customSuggestions: CustomSuggestions,
  onAddNew,
  disabled = false,
  leftComponent,
  rightComponent,
}: AutocompleteInputProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState(value);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Sync external value changes
  React.useEffect(() => {
    setSearchValue(value);
  }, [value]);

  // Handle click outside to close dropdown
  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking inside the container or dropdown
      if (
        (containerRef.current && containerRef.current.contains(target)) ||
        (dropdownRef.current && dropdownRef.current.contains(target))
      ) {
        return;
      }

      // Check if clicking on a Select portal element (these have specific data attributes or classes)
      const clickedElement = event.target as HTMLElement;
      if (
        clickedElement.closest('[role="listbox"]') ||
        clickedElement.closest('[data-radix-popper-content-wrapper]') ||
        clickedElement.closest('[data-radix-select-viewport]')
      ) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    onChange(newValue);
    setOpen(newValue.length > 0);
  };

  const handleSelect = (item: any) => {
    onSelect?.(item);
    setOpen(false);
  };

  const handleAddNew = (name: string) => {
    setSearchValue(name);
    onChange(name);
    onAddNew?.(name);
    setOpen(false);
  };

  const handleInputFocus = () => {
    // Don't open on programmatic focus (e.g. dialog auto-focus on mount)
    // Only open if the user has actively interacted (typed something)
  };

  return (
    <div className={cn('relative w-full', containerClassName)} ref={containerRef}>
      <CustomInput
        value={searchValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputClassName} w-full`}
        style={inputStyle}
        leftComponent={leftComponent}
        rightComponent={rightComponent}
      />

      {open && (
        <div ref={dropdownRef} className="absolute top-full left-0 right-0 z-50 mt-1">
          <div className="rounded-md border border-border bg-popover p-0 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
            <CustomSuggestions
              searchValue={searchValue}
              onSelect={handleSelect}
              onAddNew={onAddNew ? handleAddNew : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
