'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/src';
import { TPreferenceItem } from '@/constants/types';

interface SearchableComboboxProps {
  value: string;
  options: TPreferenceItem[];
  onSelectionChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  pinnedOptions?: TPreferenceItem[];
}

const SearchableCombobox = ({
  value,
  options,
  onSelectionChange,
  placeholder = 'Select option',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No option found.',
  className = '',
  pinnedOptions = [],
}: SearchableComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const allOptions = [...pinnedOptions, ...options];
  const selectedOption = allOptions.find((option) => option.id === value);

  // Filter options based on search query
  const filteredPinnedOptions = useMemo(() => {
    if (!searchQuery) return pinnedOptions;
    return pinnedOptions.filter((option) =>
      option.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [pinnedOptions, searchQuery]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    return options.filter((option) =>
      option.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery]);

  const hasResults = filteredPinnedOptions.length > 0 || filteredOptions.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            className,
            'flex items-center text-secondary-foreground shadow-xs border-border rounded-md w-full px-4 py-2 h-auto justify-between onboarding-select-class'
          )}
        >
          <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>{selectedOption ? selectedOption.name : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0 border-border"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <Command
          shouldFilter={false}
          className="[&_[data-slot=command-input-wrapper]]:border-border"
        >
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-10 border-border placeholder:text-muted-foreground"
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList
            style={{ maxHeight: '10rem', overflowY: 'auto' }}
            onWheel={(e) => e.stopPropagation()}
          >
            {!hasResults && (
              <div className="py-5 text-center text-sm text-muted-foreground">{emptyMessage}</div>
            )}
            <CommandGroup>
              {filteredPinnedOptions.map((option) => {
                const isSelected = value === option.id;
                return (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => {
                      onSelectionChange(option.id);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="cursor-pointer"
                  >
                    <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{option.name}</span>
                  </CommandItem>
                );
              })}

              {filteredOptions.map((option) => {
                const isSelected = value === option.id;
                return (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => {
                      onSelectionChange(option.id);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="cursor-pointer"
                  >
                    <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{option.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableCombobox;
