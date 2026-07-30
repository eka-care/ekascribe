'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@ui/src';
import { Badge } from '@/components/ui/badge';

interface MultiSelectOption {
  id: string;
  name: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: MultiSelectOption[];
  onSelectionChange: (selected: MultiSelectOption[]) => void;
  placeholder?: string;
  maxSelections?: number;
  className?: string;
  emptyMessage?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
}

const MultiSelectInput = ({
  options,
  selected,
  onSelectionChange,
  placeholder = 'Select items...',
  maxSelections,
  className,
  emptyMessage = 'No options available.',
  disabled = false,
  searchPlaceholder = 'Search...',
}: MultiSelectProps) => {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    return options.filter((option) =>
      option.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery]);

  const handleSelect = (option: MultiSelectOption) => {
    const isSelected = selected.some((item) => item.id === option.id);

    if (isSelected) {
      onSelectionChange(selected.filter((item) => item.id !== option.id));
    } else {
      if (!maxSelections || selected.length < maxSelections) {
        onSelectionChange([...selected, option]);
      }
    }
  };

  const handleRemove = (optionId: string) => {
    onSelectionChange(selected.filter((item) => item.id !== optionId));
  };

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(isOpen) => {
        if (disabled) return;
        setOpen(isOpen);
        if (!isOpen) setSearchQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between min-h-10 h-auto p-2 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed', className)}
        >
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((item) => (
                <Badge
                  key={item.id}
                  variant="secondary"
                  className="text-xs max-w-full flex items-center gap-1 min-w-0"
                >
                  <span className="truncate min-w-0">{item.name}</span>
                  {!disabled && (
                    <div
                      className="cursor-pointer shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemove(item.id);
                      }}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </div>
                  )}
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="border-border p-0 w-(--radix-popover-trigger-width)"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-10 w-full bg-transparent py-3 px-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="h-full">
          <div
            className="max-h-40"
            onWheel={(e) => {
              e.stopPropagation();
            }}
          >
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selected.some((item) => item.id === option.id);
                const isDisabled = maxSelections && selected.length >= maxSelections && !isSelected;

                return (
                  <div
                    key={option.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isDisabled) {
                        handleSelect(option);
                      }
                    }}
                    className={cn(
                      'flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground',
                      isDisabled &&
                        'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-current'
                    )}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                    />
                    {option.name}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelectInput;
