'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { MedicationSuggestion } from '../../medication/medication-columns';

interface PillsCellProps {
  suggestions: MedicationSuggestion[];
  selectedMedicationId: string;
  onSelect: (suggestion: MedicationSuggestion) => void;
  onDeselect: () => void;
  disabled?: boolean;
}

export function PillsCell({
  suggestions,
  selectedMedicationId,
  onSelect,
  onDeselect,
  disabled = false,
}: PillsCellProps) {
  const handleClick = useCallback(
    (suggestion: MedicationSuggestion) => {
      if (disabled) return;
      if (suggestion.medication_id === selectedMedicationId) {
        onDeselect();
      } else {
        onSelect(suggestion);
      }
    },
    [disabled, selectedMedicationId, onSelect, onDeselect]
  );

  if (!suggestions.length) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5 items-center min-h-8 py-1"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {suggestions.map((suggestion) => {
        const isSelected = suggestion.medication_id === selectedMedicationId;
        return (
          <button
            key={suggestion.medication_id}
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium transition-colors max-w-52',
              isSelected
                ? 'bg-[#215FFF] text-white'
                : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]',
              disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'
            )}
            title={suggestion.name}
            onClick={(e) => {
              e.stopPropagation();
              handleClick(suggestion);
            }}
          >
            <span className="truncate">{suggestion.name}</span>
          </button>
        );
      })}
    </div>
  );
}
