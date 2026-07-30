'use client';

import { ChevronsUpDown, Search, X } from 'lucide-react';
import { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/src';
import { TPreferenceItem } from '@/constants/types';

export interface SuggestedPill {
  id: string;
  label: string;
}

const PILL_BASE =
  'min-w-16 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-sm font-medium leading-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

const SelectablePill = ({
  selected,
  disabled,
  onToggle,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => {
  if (selected) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${PILL_BASE} pl-3 pr-2 bg-primary text-primary-foreground border-primary hover:opacity-90`}
      >
        <span>{children}</span>
        <X className="size-3.5" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`${PILL_BASE} px-3 bg-background text-primary border-border hover:bg-secondary`}
    >
      {children}
    </button>
  );
};

export const CustomSpecialtyDialog = ({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    onClose();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className={`relative w-[420px] max-w-[calc(100vw-32px)] bg-background border border-border rounded-lg p-6 flex flex-col gap-3 shadow-md transition-all duration-200 ${
          open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-[7px] top-[7px] p-2 rounded-lg hover:bg-secondary cursor-pointer"
          aria-label="Close"
        >
          <X className="size-4 text-foreground" />
        </button>

        <div className="flex flex-col gap-3">
          <p className="text-base font-medium leading-6 text-foreground">
            Can&rsquo;t find your specialty in the list?
          </p>
          <p className="text-sm leading-5 text-[#767676] max-w-[252px]">
            Add it here so we can personalize note formats and terminology.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Type here..."
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2.5 text-sm leading-5 text-foreground placeholder:text-[#767676] outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!value.trim()}
            className="shrink-0 min-w-[80px] bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium leading-6 cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const AddPillCombobox = ({
  options,
  onAdd,
  searchPlaceholder,
  emptyMessage,
  disabled,
  onSelectOther,
}: {
  options: TPreferenceItem[];
  onAdd: (option: TPreferenceItem) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  disabled?: boolean;
  onSelectOther?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between text-secondary-foreground border-border rounded-lg h-10 px-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <Search className="size-4 shrink-0 opacity-50" />
            <span className="text-[#767676] truncate">Select from dropdown</span>
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0 border-border overflow-hidden"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={16}
        style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
      >
        <Command
          shouldFilter={false}
          className="flex flex-col max-h-[inherit] [&_[data-slot=command-input-wrapper]]:border-border [&:has([data-add-custom]:hover)_[data-selected=true]]:bg-transparent"
        >
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            className="h-10 border-border shrink-0"
          />
          <CommandList className="flex-1 min-h-0 overflow-y-auto">
            {filtered.length === 0 && <CommandEmpty>{emptyMessage}</CommandEmpty>}
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    setOpen(false);
                    setQuery('');
                    if (option.id === 'other' && onSelectOther) {
                      setTimeout(onSelectOther, 150);
                    } else {
                      setTimeout(() => onAdd(option), 150);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <span className="truncate">{option.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {onSelectOther && (
            <div className="border-t border-border p-1 shrink-0">
              <button
                type="button"
                data-add-custom
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  setQuery('');
                  setTimeout(onSelectOther, 150);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm text-primary font-medium cursor-pointer hover:bg-accent"
              >
                <span className="text-base leading-none">+</span>
                Add custom
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface PillSelectorQuestionProps {
  number: number;
  title: string;
  hint: string;
  suggested: SuggestedPill[];
  allOptions: TPreferenceItem[];
  selected: TPreferenceItem[];
  onChange: (items: TPreferenceItem[]) => void;
  max: number;
  searchPlaceholder: string;
  emptyMessage: string;
  onSelectOther?: () => void;
}

export const PillSelectorQuestion = ({
  number,
  title,
  hint,
  suggested,
  allOptions,
  selected,
  onChange,
  max,
  searchPlaceholder,
  emptyMessage,
  onSelectOther,
}: PillSelectorQuestionProps) => {
  const suggestedIds = useMemo(() => new Set(suggested.map((s) => s.id)), [suggested]);
  const atMax = selected.length >= max;

  const dropdownOptions = useMemo(
    () =>
      allOptions.filter((o) => !suggestedIds.has(o.id) && !selected.some((sel) => sel.id === o.id)),
    [allOptions, suggestedIds, selected]
  );

  const addOption = (option: TPreferenceItem) => {
    if (atMax) return;
    if (selected.some((s) => s.id === option.id)) return;
    onChange([...selected, option]);
  };

  const removeOption = (id: string) => onChange(selected.filter((s) => s.id !== id));

  const togglePill = (id: string) => {
    if (selected.some((s) => s.id === id)) {
      removeOption(id);
      return;
    }
    const option = allOptions.find((o) => o.id === id);
    if (option) addOption(option);
  };

  return (
    <div className="relative flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className="inline-flex items-center justify-center size-5 rounded-xl bg-accent text-primary text-xs font-medium leading-4 shrink-0"
        >
          {number}
        </span>
        <h2 className="text-base leading-6 font-medium text-foreground">{title}</h2>
        <span className="text-xs leading-4 text-[#767676]">{hint}</span>
      </div>

      <div className="flex flex-wrap gap-2 items-start w-full max-w-[900px]">
        {suggested.map((pill) => {
          const isSelected = selected.some((s) => s.id === pill.id);
          return (
            <SelectablePill
              key={pill.id}
              selected={isSelected}
              disabled={!isSelected && atMax}
              onToggle={() => togglePill(pill.id)}
            >
              {pill.label}
            </SelectablePill>
          );
        })}
        {selected
          .filter((s) => !suggestedIds.has(s.id))
          .map((s) => (
            <SelectablePill key={s.id} selected onToggle={() => removeOption(s.id)}>
              {s.name}
            </SelectablePill>
          ))}
        <div className="w-full sm:w-[306px]">
          <AddPillCombobox
            options={dropdownOptions}
            onAdd={addOption}
            searchPlaceholder={searchPlaceholder}
            emptyMessage={emptyMessage}
            disabled={atMax}
            onSelectOther={onSelectOther}
          />
        </div>
      </div>
    </div>
  );
};
