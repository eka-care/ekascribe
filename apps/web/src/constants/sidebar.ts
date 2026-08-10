export const SESSION_FILTER_GROUPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'in_progress', label: 'In Progress', statuses: ['in-progress'] },
  { key: 'published', label: 'Published', statuses: ['success'] },
  { key: 'error', label: 'Error', statuses: ['system_failure', 'request_failure', 'cancelled'] },
];

export const ALL_GROUP_KEYS = SESSION_FILTER_GROUPS.map((g) => g.key);
