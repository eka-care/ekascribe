import type { TPreferenceItem } from '@/constants/types';
import { SUPPORTED_OUTPUT_FORMATS_PROD } from '@/constants/settings';

// Output template(s) a session uses: session config → user defaults → app default.
export function resolveOutputTemplates(
  sessionTemplates: TPreferenceItem[] | undefined,
  userDefaultTemplates: TPreferenceItem[] | undefined
): TPreferenceItem[] {
  if (sessionTemplates?.length) return sessionTemplates;

  if (userDefaultTemplates?.length) return userDefaultTemplates;

  return [SUPPORTED_OUTPUT_FORMATS_PROD[0]];
}
