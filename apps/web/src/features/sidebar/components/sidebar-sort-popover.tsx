import { ArrowUpDown, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@ui/src';

interface SidebarSortPopoverProps {
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (order: 'asc' | 'desc') => void;
}

const SORT_OPTIONS: Array<{ value: 'asc' | 'desc'; label: string; icon: React.ReactNode }> = [
  { value: 'asc', label: 'Time (Ascending)', icon: <ArrowUp className="w-4 h-4" /> },
  { value: 'desc', label: 'Time (Descending)', icon: <ArrowDown className="w-4 h-4" /> },
];

const SidebarSortPopover = ({ sortOrder, onSortOrderChange }: SidebarSortPopoverProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`relative cursor-pointer shrink-0 data-[state=open]:text-primary ${
            sortOrder === 'asc' ? 'text-primary' : 'text-[#767676] hover:text-primary'
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          {sortOrder === 'asc' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1 border border-[#D1D1D1] rounded-lg shadow-lg bg-white">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onSortOrderChange(option.value)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded cursor-pointer ${
              sortOrder === option.value ? 'bg-[#E9EFFF]' : 'hover:bg-[#F5F5F5]'
            }`}
          >
            <span className={sortOrder === option.value ? 'text-primary' : 'text-[#767676]'}>
              {option.icon}
            </span>
            <span className="flex-1 text-left text-sm text-[#1A1A1A]">{option.label}</span>
            <Check className={`w-4 h-4 text-primary shrink-0 ${sortOrder === option.value ? 'opacity-100' : 'opacity-0'}`} />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

export default SidebarSortPopover;
