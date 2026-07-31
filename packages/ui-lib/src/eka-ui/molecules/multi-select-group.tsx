import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  id: string;
  label: string;
  value: string;
}

export enum MULTI_SELECT_ADDITIONAL_OPTION {
  NOTA = 'none_of_the_above',
  AOTA = 'all_of_the_above',
}

// Generic interface that extends MultiSelectOption to allow for custom option types
export interface BaseMultiSelectOption {
  id: string;
  label: string;
  value: string;
}

interface MultiSelectGroupProps<T extends BaseMultiSelectOption = MultiSelectOption> {
  options: T[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  additionalOption?: MULTI_SELECT_ADDITIONAL_OPTION;
  className?: string;
  required?: boolean;
  maxSelections?: number;
  error?: string;
}

export function MultiSelectGroup<T extends BaseMultiSelectOption = MultiSelectOption>({
  options,
  selectedValues,
  onSelectionChange,
  additionalOption,
  className,
  required = true,
  maxSelections,
  error,
}: MultiSelectGroupProps<T>) {
  // Create the extra option based on additionalOption enum
  const extraOption = additionalOption
    ? {
        id: `extra-${additionalOption}`,
        label:
          additionalOption === MULTI_SELECT_ADDITIONAL_OPTION.AOTA
            ? 'All of the above'
            : 'None of the above',
        value:
          additionalOption === MULTI_SELECT_ADDITIONAL_OPTION.AOTA
            ? 'All of the above'
            : 'None of the above',
      }
    : undefined;

  const handleOptionChange = (optionValue: string, checked: boolean) => {
    let newSelection: string[];

    if (extraOption && optionValue === extraOption.value) {
      // If extra option is selected, handle based on additionalOption type
      if (additionalOption === MULTI_SELECT_ADDITIONAL_OPTION.NOTA) {
        // If "none of the above" is selected, clear all other selections
        newSelection = checked ? [extraOption.value] : [];
      } else if (additionalOption === MULTI_SELECT_ADDITIONAL_OPTION.AOTA) {
        // If "all of the above" is selected, select all options
        if (checked) {
          newSelection = [...options.map((opt) => opt.value), extraOption.value];
        } else {
          newSelection = selectedValues.filter((value) => value !== extraOption.value);
        }
      } else {
        // Default behavior for extra option
        newSelection = checked
          ? [...selectedValues, extraOption.value]
          : selectedValues.filter((value) => value !== extraOption.value);
      }
    } else {
      // If a regular option is selected, handle based on additionalOption type
      let filteredSelection = selectedValues;

      if (extraOption && additionalOption === MULTI_SELECT_ADDITIONAL_OPTION.NOTA) {
        // Remove extra option if it exists when selecting regular options
        filteredSelection = selectedValues.filter((value) => value !== extraOption.value);
      } else if (extraOption && additionalOption === MULTI_SELECT_ADDITIONAL_OPTION.AOTA) {
        // Remove extra option if it exists when selecting regular options
        filteredSelection = selectedValues.filter((value) => value !== extraOption.value);
      }

      if (checked) {
        if (maxSelections && filteredSelection.length >= maxSelections) {
          return; // Prevent selecting more than max allowed
        }
        newSelection = [...filteredSelection, optionValue];
      } else {
        newSelection = filteredSelection.filter((value) => value !== optionValue);
      }
    }

    // If required and no options selected, don't allow deselection of the last item
    if (required && newSelection.length === 0 && selectedValues.length === 1) {
      return; // Prevent deselecting the last option when required
    }

    onSelectionChange(newSelection);
  };

  const isValid = !required || selectedValues.length > 0;
  const currentNonExtraSelections = extraOption
    ? selectedValues.filter((value) => value !== extraOption.value).length
    : selectedValues.length;

  return (
    <div
      className={cn(
        // Container styling matching the image and other components
        'bg-gray-50', // Light grey background like the image
        'rounded-lg', // Rounded corners
        'p-4', // Padding inside
        'border border-gray-200', // Subtle border
        className
      )}
    >
      <div className="space-y-3">
        {options.map((option) => {
          const isDisabled =
            maxSelections &&
            currentNonExtraSelections >= maxSelections &&
            !selectedValues.includes(option.value);

          return (
            <div key={option.id} className="flex items-center space-x-3">
              <Checkbox
                id={option.id}
                checked={!!selectedValues.includes(option.value)}
                disabled={!!isDisabled}
                onCheckedChange={(checked) => handleOptionChange(option.value, Boolean(checked))}
                className="mt-0.5 border border-muted-foreground"
              />
              <label
                htmlFor={option.id}
                className={cn(
                  // Using the same muted color scheme as your other components
                  'text-sm font-medium leading-none cursor-pointer',
                  isDisabled
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-secondary-foreground' // Dark grey like other components
                )}
              >
                {option.label}
              </label>
            </div>
          );
        })}

        {extraOption && (
          <>
            {/* Separator line like in the image */}
            <div className="border-t border-gray-300 my-3" />
            <div className="flex items-center space-x-3">
              <Checkbox
                id={extraOption.id}
                checked={selectedValues.includes(extraOption.value)}
                onCheckedChange={(checked) =>
                  handleOptionChange(extraOption.value, checked as boolean)
                }
                className="mt-0.5 border border-muted-foreground"
              />
              <label
                htmlFor={extraOption.id}
                className="text-sm font-medium leading-none cursor-pointer text-secondary-foreground"
              >
                {extraOption.label}
              </label>
            </div>
          </>
        )}
      </div>

      {/* Error and validation messages */}
      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      {required && !isValid && (
        <p className="text-sm text-[var(--color-danger-default)] mt-3">Please select at least one option</p>
      )}
      {maxSelections && currentNonExtraSelections >= maxSelections && (
        <p className="text-sm text-[var(--color-primary)] mt-3">
          {maxSelections === 1
            ? 'You can select only 1 option'
            : `Maximum ${maxSelections} selections allowed`}
        </p>
      )}
    </div>
  );
}
