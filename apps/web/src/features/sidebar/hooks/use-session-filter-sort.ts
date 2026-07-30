import { useCallback, useMemo, useState } from 'react';
import { CircleDashed } from 'lucide-react';
import { createElement } from 'react';
import CheckCircleFillIcon from '@/assets/check-circle-fill-icon';
import ErrorDocumentIcon from '@/assets/error-document-icon';
import { SESSION_FILTER_GROUPS, ALL_GROUP_KEYS } from '@/constants/sidebar';
import type { FilterGroup } from '@/features/sidebar/components/sidebar-filter-popover';

const filterGroupIcons: Record<string, React.ReactNode> = {
  in_progress: createElement(CircleDashed, { className: 'w-4 h-4 text-[#767676]' }),
  published: createElement(CheckCircleFillIcon, { color: '#039855' }),
  unpublished: createElement(CheckCircleFillIcon, { color: '#D97706' }),
  error: createElement(ErrorDocumentIcon, { size: 16 }),
};

export const useSessionFilterSort = <T extends { processing_status: string }>(sessions: T[]) => {
  const [activeGroupKeys, setActiveGroupKeys] = useState<Set<string>>(new Set(ALL_GROUP_KEYS));
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const isFilterActive = activeGroupKeys.size < ALL_GROUP_KEYS.length;

  const filterGroupsWithCounts = useMemo<FilterGroup[]>(() => {
    return SESSION_FILTER_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      icon: filterGroupIcons[g.key],
      count: sessions.filter((s) => g.statuses.includes(s.processing_status)).length,
      checked: activeGroupKeys.has(g.key),
    }));
  }, [sessions, activeGroupKeys]);

  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (isFilterActive) {
      const allowed = SESSION_FILTER_GROUPS.filter((g) => activeGroupKeys.has(g.key)).flatMap(
        (g) => g.statuses
      );
      result = result.filter((s) => allowed.includes(s.processing_status));
    }
    return sortOrder === 'asc' ? [...result].reverse() : result;
  }, [sessions, isFilterActive, activeGroupKeys, sortOrder]);

  const toggleFilterGroup = useCallback((key: string) => {
    setActiveGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveGroupKeys(new Set(ALL_GROUP_KEYS));
  }, []);

  const toggleSortOrder = useCallback((order: 'asc' | 'desc') => {
    setSortOrder(order);
  }, []);

  return {
    filterGroupsWithCounts,
    filteredSessions,
    isFilterActive,
    sortOrder,
    toggleFilterGroup,
    clearFilters,
    toggleSortOrder,
  };
};
