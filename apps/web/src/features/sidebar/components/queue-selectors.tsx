'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/src';
import { TEmrClinic, TEmrDoctor } from '@/features/sidebar/hooks/use-emr-configuration';
import { cn } from '@/lib/utils';
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';

interface QueueSelectorsProps {
  clinics: TEmrClinic[];
  doctors: TEmrDoctor[];
  selectedClinicId: string | null;
  selectedDoctorId: string | null;
  onClinicChange: (clinicId: string | null) => void;
  onDoctorChange: (doctorId: string | null) => void;
  loading: boolean;
  disabled?: boolean;
}

interface SelectorDropdownProps {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
}

const SelectorDropdown = ({
  label,
  value,
  options,
  onSelect,
  disabled = false,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
}: SelectorDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return options;
    return options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#767676]">
        {label}
      </span>
      <Popover
        open={open && !disabled}
        onOpenChange={(o) => {
          if (!disabled) {
            setOpen(o);
            if (!o) setSearch('');
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className={cn(
              'flex items-center justify-between w-full px-3 py-2 rounded-lg border border-[#D1D1D1] bg-white text-sm text-left transition-colors',
              disabled
                ? 'opacity-50 cursor-not-allowed text-[#767676]'
                : 'cursor-pointer hover:border-[#ABABAB]',
              !selected && 'text-[#767676]'
            )}
          >
            <span className="truncate">{selected ? selected.name : placeholder}</span>
            <ChevronDown className="w-4 h-4 shrink-0 text-[#767676]" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-0 border-[#D1D1D1]"
          align="start"
          side="bottom"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-9 text-sm"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty className="py-3 text-center text-xs text-[#767676]">
                No results found.
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    keywords={[option.name]}
                    onSelect={() => {
                      onSelect(option.id === value ? null : option.id);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="cursor-pointer text-sm"
                  >
                    <Check
                      className={cn('h-4 w-4 shrink-0', value === option.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="truncate">{option.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

const QueueSelectors = ({
  clinics,
  doctors,
  selectedClinicId,
  selectedDoctorId,
  onClinicChange,
  onDoctorChange,
  loading,
  disabled = false,
}: QueueSelectorsProps) => {
  if (loading) return null;

  const selectors = (
    <div className="flex flex-col gap-2">
      <SelectorDropdown
        label="Clinic"
        value={selectedClinicId ?? ''}
        options={clinics}
        onSelect={onClinicChange}
        disabled={disabled}
        placeholder="Select clinic"
        searchPlaceholder="Search clinic..."
      />
      <SelectorDropdown
        label="Doctor"
        value={selectedDoctorId ?? ''}
        options={doctors}
        onSelect={onDoctorChange}
        disabled={disabled || !selectedClinicId}
        placeholder="Select doctor"
        searchPlaceholder="Search doctor..."
      />
    </div>
  );

  if (!disabled) return selectors;

  return (
    <CustomTooltip>
      <CustomTooltipTrigger asChild>
        <div>{selectors}</div>
      </CustomTooltipTrigger>
      <CustomTooltipContent>
        Cannot change clinic or doctor while a session is in progress
      </CustomTooltipContent>
    </CustomTooltip>
  );
};

export default QueueSelectors;
