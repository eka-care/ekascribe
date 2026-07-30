import { TSelectedPatientDetails } from '@/constants/types';
import { PatientDetails } from '@eka-care/ekascribe-ts-sdk';

export type TRawPatientDetails = PatientDetails & {
  username?: string;
  biologicalSex?: string;
};

export const normalizePatientDetails = (
  raw: TRawPatientDetails | null | undefined
): TSelectedPatientDetails | null => {
  if (!raw || (!raw.name && !raw.username)) return null;

  return {
    oid: raw.oid,
    username: (raw.name || raw.username) as string,
    age: raw.age ? Number(raw.age) : 0,
    biologicalSex: (raw.gender ||
      raw.biologicalSex ||
      '') as TSelectedPatientDetails['biologicalSex'],
  };
};

/**
 * Format a date string as "Visit on DD Mon YYYY, HH:MM AM/PM"
 */
export const formatContextDate = (dateStr: string) => {
  if (!dateStr) return 'Linked session';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Linked session';
  const day = date.getDate();
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const mm = minutes.toString().padStart(2, '0');
  return `Visit on ${day} ${months[date.getMonth()]} ${date.getFullYear()}, ${h12}:${mm} ${ampm}`;
};

/**
 * Get initials from a name string (1-2 characters, uppercase).
 * Returns '–' for empty/null names.
 */
export const getInitials = (name?: string | null) => {
  if (!name) return '–';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
};
