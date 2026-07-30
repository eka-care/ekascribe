import { useCallback, useMemo, useState, createElement } from 'react';
import { UserCheck, Activity, CheckCircle, CircleDashed } from 'lucide-react';
import { QUEUE_FILTER_GROUPS, ALL_QUEUE_GROUP_KEYS } from '@/constants/sidebar';
import type { FilterGroup } from '@/features/sidebar/components/sidebar-filter-popover';
import type { TQueueAppointment } from '@/features/sidebar/hooks/use-queue-appointments';

const queueFilterIcons: Record<string, React.ReactNode> = {
  BK: createElement(CircleDashed, { className: 'w-4 h-4 text-[#767676]' }),
  CK: createElement(UserCheck, { className: 'w-4 h-4 text-[#767676]' }),
  OG: createElement(Activity, { className: 'w-4 h-4 text-[#767676]' }),
  CM: createElement(CheckCircle, { className: 'w-4 h-4 text-[#767676]' }),
};

export const useQueueFilter = (appointments: TQueueAppointment[]) => {
  const [activeGroupKeys, setActiveGroupKeys] = useState<Set<string>>(
    new Set(ALL_QUEUE_GROUP_KEYS)
  );

  const isFilterActive = activeGroupKeys.size < ALL_QUEUE_GROUP_KEYS.length;

  const filterGroupsWithCounts = useMemo<FilterGroup[]>(() => {
    return QUEUE_FILTER_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      icon: queueFilterIcons[g.key],
      count: appointments.filter((a) => g.statuses.includes(a.status)).length,
      checked: activeGroupKeys.has(g.key),
    }));
  }, [appointments, activeGroupKeys]);

  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const filteredAppointments = useMemo(() => {
    let result = appointments;
    if (isFilterActive) {
      const allowed = QUEUE_FILTER_GROUPS.filter((g) => activeGroupKeys.has(g.key)).flatMap(
        (g) => g.statuses
      );
      result = result.filter((a) => allowed.includes(a.status));
    }
    const sorted = [...result].sort((a, b) => {
      const diff = a.created_at.getTime() - b.created_at.getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });
    return sorted;
  }, [appointments, isFilterActive, activeGroupKeys, sortOrder]);

  const toggleSortOrder = useCallback((order: 'asc' | 'desc') => {
    setSortOrder(order);
  }, []);

  const toggleFilterGroup = useCallback((key: string) => {
    setActiveGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveGroupKeys(new Set(ALL_QUEUE_GROUP_KEYS));
  }, []);

  return {
    filterGroupsWithCounts,
    filteredAppointments,
    isFilterActive,
    sortOrder,
    toggleFilterGroup,
    clearFilters,
    toggleSortOrder,
  };
};
