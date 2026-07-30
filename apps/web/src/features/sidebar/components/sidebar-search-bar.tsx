import { Search, RefreshCw } from 'lucide-react';
import SidebarFilterPopover, { FilterGroup } from './sidebar-filter-popover';
import SidebarSortPopover from './sidebar-sort-popover';

export type { FilterGroup };

interface SidebarSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  filterGroups?: FilterGroup[];
  onToggleFilterGroup?: (key: string) => void;
  onClearFilters?: () => void;
  isFilterActive?: boolean;
  sortOrder?: 'asc' | 'desc';
  onSortOrderChange?: (order: 'asc' | 'desc') => void;
}

const SidebarSearchBar = ({
  value,
  onChange,
  placeholder,
  onRefresh,
  isRefreshing,
  filterGroups,
  onToggleFilterGroup,
  onClearFilters,
  isFilterActive,
  sortOrder,
  onSortOrderChange,
}: SidebarSearchBarProps) => {
  const showFilter = !!filterGroups;
  const showSort = !!sortOrder && !!onSortOrderChange;

  return (
    <div className="flex items-center gap-2 px-3 pt-2">
      <div className="flex-1 flex items-center gap-1 bg-[#EDEDED] rounded-lg px-2 py-2 border border-transparent focus-within:border-primary focus-within:bg-white transition-colors">
        <Search className="w-4 h-4 text-[#767676] shrink-0" />
        <input
          placeholder={placeholder}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          className="bg-transparent border-0 outline-none text-xs font-medium text-[#1A1A1A] placeholder:text-[#767676] w-full"
        />
      </div>

      {showFilter && (
        <SidebarFilterPopover
          filterGroups={filterGroups!}
          onToggleFilterGroup={onToggleFilterGroup!}
          onClearFilters={onClearFilters!}
          isFilterActive={!!isFilterActive}
        />
      )}

      {showSort && (
        <SidebarSortPopover
          sortOrder={sortOrder!}
          onSortOrderChange={onSortOrderChange!}
        />
      )}

      <button
        onClick={onRefresh}
        className={`cursor-pointer text-[#767676] hover:text-primary shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  );
};

export default SidebarSearchBar;
