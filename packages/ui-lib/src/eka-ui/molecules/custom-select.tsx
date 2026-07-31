import * as React from 'react';
import { ChevronDownIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CustomSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  options?: Array<{
    value: string;
    label: string;
  }>;
  size?: 'sm' | 'default';
}

export function CustomSelect({
  value,
  onValueChange,
  placeholder = 'Select an option',
  className,
  triggerClassName,
  contentClassName,
  disabled = false,
  options = [],
  size = 'default',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  // Handle click outside
  // React.useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (
  //       dropdownRef.current &&
  //       !dropdownRef.current.contains(event.target as Node) &&
  //       triggerRef.current &&
  //       !triggerRef.current.contains(event.target as Node)
  //     ) {
  //       setIsOpen(false);
  //     }
  //   };

  //   if (isOpen) {
  //     document.addEventListener('mousedown', handleClickOutside);
  //   }

  //   return () => {
  //     document.removeEventListener('mousedown', handleClickOutside);
  //   };
  // }, [isOpen]);

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onValueChange?.(optionValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className={cn('relative w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled}
        className={cn(
          'border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*="text-"])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden',
          size === 'default' ? 'min-h-9' : 'min-h-8',
          triggerClassName
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span
          className={cn(
            'flex-1 text-left min-w-0 overflow-hidden break-words line-clamp-2',
            !selectedOption && 'text-muted-foreground'
          )}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDownIcon
          className={cn(
            'size-4 opacity-50 pointer-events-none shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 relative z-50 max-h-[300px] min-w-[8rem] w-full overflow-x-hidden overflow-y-auto rounded-md shadow-md mt-1',
            contentClassName
          )}
          role="listbox"
        >
          <div className="p-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                No options available
              </div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      'relative flex w-full cursor-pointer items-center gap-1 rounded-sm py-2.5 px-3 text-sm outline-none select-none transition-colors duration-150',
                      'hover:bg-accent hover:text-accent-foreground',
                      'focus-visible:bg-accent focus-visible:text-accent-foreground',
                      'active:bg-accent/80',
                      isSelected && 'bg-accent/50 text-foreground',
                      disabled && 'pointer-events-none opacity-50 cursor-not-allowed'
                    )}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!disabled) {
                          handleSelect(option.value);
                        }
                      }
                    }}
                  >
                    <span className="flex-1 text-left min-w-0 break-words line-clamp-2">
                      {option.label}
                    </span>
                    {isSelected && (
                      <span className="absolute right-3 flex size-4 items-center justify-center shrink-0 pointer-events-none">
                        <CheckIcon className="size-4 text-foreground" />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
