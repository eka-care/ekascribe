export type MedicationColumnKind = 'autocomplete' | 'dropdown' | 'text' | 'pills';

export type MedicationSuggestion = {
  medication_id: string;
  name: string;
  generic_name: string;
  form_name: string;
  manufacturer: string;
  rank: number;
  score: number;
};

export const DEFAULT_COLUMN_WIDTH = 120;

export type MedicationColumnDef = {
  key: string;
  label: string;
  kind: MedicationColumnKind;
  width?: number;
  options?: string[];
};

export const PREDEFINED_MEDICATION_COLUMNS: MedicationColumnDef[] = [
  {
    key: 'drug_name',
    label: 'Medicine',
    kind: 'autocomplete',
    width: 200,
  },
  {
    key: 'raw_name',
    label: 'Raw Name',
    kind: 'text',
    width: 140,
  },
  {
    key: 'strength',
    label: 'Strength',
    kind: 'text',
    width: 120,
  },
  {
    key: 'dosage',
    label: 'Dosage',
    kind: 'dropdown',
    width: 120,
    options: [
      '½ tablet',
      '1 tablet',
      '1½ tablets',
      '2 tablets',
      '1 capsule',
      '2 capsules',
      '5 ml',
      '10 ml',
      '15 ml',
      '1 puff',
      '2 puffs',
    ],
  },
  {
    key: 'frequency',
    label: 'Frequency',
    kind: 'dropdown',
    width: 120,
    options: [
      'Once a day (OD)',
      'Twice a day (BD)',
      'Thrice a day (TDS)',
      'Four times a day (QID)',
      '1-0-0',
      '0-1-0',
      '0-0-1',
      '1-0-1',
      '1-1-0',
      '0-1-1',
      '1-1-1',
      'SOS',
      'Every 4 hours',
      'Every 6 hours',
      'Every 8 hours',
      'Every 12 hours',
      'Once a week',
      'Twice a week',
      'At bedtime (HS)',
    ],
  },
  {
    key: 'timing',
    label: 'Timing',
    kind: 'dropdown',
    width: 120,
    options: [
      'Before meal',
      'After meal',
      'With meal',
      'Empty stomach',
      'Before breakfast',
      'After breakfast',
      'Before lunch',
      'After lunch',
      'Before dinner',
      'After dinner',
      'At bedtime',
      'Morning',
      'Evening',
    ],
  },
  {
    key: 'duration',
    label: 'Duration',
    kind: 'dropdown',
    width: 120,
    options: [
      '1 day',
      '2 days',
      '3 days',
      '5 days',
      '7 days',
      '10 days',
      '14 days',
      '1 week',
      '2 weeks',
      '3 weeks',
      '4 weeks',
      '1 month',
      '2 months',
      '3 months',
      '6 months',
      'As directed',
      'Until next visit',
      'Ongoing/Lifelong',
    ],
  },
  {
    key: 'route',
    label: 'Route',
    kind: 'dropdown',
    width: 120,
    options: [
      'Oral',
      'Topical',
      'IV',
      'IM',
      'Subcutaneous',
      'Inhalation',
      'Sublingual',
      'Rectal',
      'Nasal',
      'Ophthalmic',
      'Otic',
      'Transdermal',
    ],
  },
  {
    key: 'quantity',
    label: 'Quantity',
    kind: 'dropdown',
    width: 120,
    options: [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '15',
      '20',
      '30',
      '1 strip',
      '2 strips',
      '1 bottle',
      '1 tube',
      '1 packet',
      '1 box',
    ],
  },
  {
    key: 'notes',
    label: 'Instructions',
    kind: 'text',
    width: 180,
  },
  {
    key: 'suggestions',
    label: 'Suggestions',
    kind: 'pills',
    width: 240,
  },
];

const columnsByKey = new Map(PREDEFINED_MEDICATION_COLUMNS.map((col) => [col.key, col]));

export function getColumnDef(key: string): MedicationColumnDef | undefined {
  return columnsByKey.get(key);
}
