'use client';

import { TPreferenceItem } from '@/constants/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/src';

interface SingleSelectInputProps {
  name?: string;
  value: string;
  options: TPreferenceItem[];
  onSelectionChange: (selected: string) => void;
  placeholder?: string;
  triggerClassName?: string;
  contentClassName?: string;
  emptyMessage?: string;
}

const SingleSelectInput = ({
  name,
  value,
  options,
  onSelectionChange,
  placeholder = 'Select option',
  triggerClassName = 'border-border rounded-md shadow-xs w-full cursor-pointer',
  contentClassName = 'border-border rounded-md shadow-xs cursor-pointer',
  emptyMessage = 'No options available.',
}: SingleSelectInputProps) => {
  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <Select
      name={name}
      value={value}
      onValueChange={(selectedId) => {
        onSelectionChange(selectedId);
      }}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder}>
          {selectedOption ? selectedOption.name : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={`${contentClassName} max-h-40`}>
        {options.length === 0 ? (
          <SelectItem value="no-options" disabled>
            {emptyMessage}
          </SelectItem>
        ) : (
          options.map((opt) => (
            <SelectItem
              key={opt.id}
              value={opt.id}
              textValue={opt.name}
              className="w-full cursor-pointer"
            >
              <div className="flex w-full flex-col gap-0.5">
                <div className="text-sm">{opt.name}</div>
                {opt.desc && <div className="text-xs text-muted-foreground">{opt.desc}</div>}
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
};

export default SingleSelectInput;
