import type { TPreferenceItem } from '@/constants/types';

// Output template(s) a session uses: session config → user defaults.
// No app-level fallback: with no template selected, nothing is generated
// after a session ends — the transcript alone remains.
export function resolveOutputTemplates(
  sessionTemplates: TPreferenceItem[] | undefined,
  userDefaultTemplates: TPreferenceItem[] | undefined
): TPreferenceItem[] {
  if (sessionTemplates?.length) return sessionTemplates;

  if (userDefaultTemplates?.length) return userDefaultTemplates;

  return [];
}
