import type { ReactNode } from 'react';
import { ListFilter, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@ui/src';

export type FilterGroup = {
  key: string;
  label: string;
  count: number;
  checked: boolean;
  icon: ReactNode;
};

interface SidebarFilterPopoverProps {
  filterGroups: FilterGroup[];
  onToggleFilterGroup: (key: string) => void;
  onClearFilters: () => void;
  isFilterActive: boolean;
}

const SidebarFilterPopover = ({
  filterGroups,
  onToggleFilterGroup,
  onClearFilters,
  isFilterActive,
}: SidebarFilterPopoverProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`relative cursor-pointer shrink-0 ${
            isFilterActive ? 'text-primary' : 'text-[#767676] hover:text-primary'
          }`}
        >
          <ListFilter className="w-4 h-4" />
          {isFilterActive && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1 border border-[#D1D1D1] rounded-lg shadow-lg bg-white"
>
        {filterGroups.map((group) => (
          <button
            key={group.key}
            onClick={() => onToggleFilterGroup(group.key)}
            className="w-full flex items-center gap-2 px-3 py-2 roun\ded hover:bg-[#F5F5F5] cursor-pointer"
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                group.checked ? 'bg-primary border-primary' : 'border-[#D1D1D1]'
              }`}
            >
              {group.checked && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="shrink-0">{group.icon}</span>
            <span className="flex-1 text-left text-sm text-[#1A1A1A]">{group.label}</span>
            <span className="text-xs text-[#767676]">{group.count}</span>
          </button>
        ))}
        <div className="border-t border-[#D1D1D1] mt-1 pt-1">
          <button
            onClick={onClearFilters}
            className="w-full text-center text-sm text-[#1A1A1A] px-3 py-2 rounded hover:bg-[#F5F5F5] cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SidebarFilterPopover;
