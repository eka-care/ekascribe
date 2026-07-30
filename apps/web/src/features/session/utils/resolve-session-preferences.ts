import type { TPreferenceItem } from '@/constants/types';

export type TResolvedSessionPreferences = {
  input_languages: TPreferenceItem[];
  output_format_template: TPreferenceItem[];
  consultation_mode?: string;
  model_type?: string;
};

export type TRawSessionConfig = {
  input_language?: string[];
  request_templates?: {
    visual?: Array<{ template_id?: string }>;
    integration?: unknown;
  };
  consultation_mode?: string;
  model_type?: string;
};

type TResolveLookups = {
  supportedLanguages: TPreferenceItem[];
  documents: Array<{ template_id?: string; document_name?: string }>;
};

/**
 * Build a session's display config from the get-session-details response.
 *  - input_language: language codes → resolve names from the supported list.
 *  - request_templates.visual: take each template_id → resolve its name from documents[].
 *  - consultation_mode / model_type: used as-is.
 * Returns null when the response carries none of these fields.
 */
export function resolveSessionPreferences(
  data: TRawSessionConfig | undefined,
  { supportedLanguages, documents }: TResolveLookups
): TResolvedSessionPreferences | null {
  if (!data) return null;

  const input_languages: TPreferenceItem[] = (data.input_language || []).map((code) => ({
    id: code,
    name: supportedLanguages.find((lang) => lang.id === code)?.name || code,
  }));

  const output_format_template: TPreferenceItem[] = (data.request_templates?.visual || [])
    .map((t) => {
      const id = t.template_id || '';
      if (!id) return null;
      return {
        id,
        name: documents.find((doc) => doc.template_id === id)?.document_name || '',
      };
    })
    .filter(Boolean) as TPreferenceItem[];

  return {
    input_languages,
    output_format_template,
    consultation_mode: data.consultation_mode,
    model_type: data.model_type,
  };
}
