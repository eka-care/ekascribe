import type { TDocumentError, TSessionDocument } from '@eka-care/ekascribe-ts-sdk';
import type { NormalizedDocument } from '../types';

export function normalizeDocuments(documents: TSessionDocument[]): {
  context: NormalizedDocument[];
  transcript: NormalizedDocument[];
  documents: NormalizedDocument[];
} {
  const context: NormalizedDocument[] = [];
  const transcript: NormalizedDocument[] = [];
  const docs: NormalizedDocument[] = [];

  for (const doc of documents) {
    if (doc.document_type === 'integration') continue;

    const normalized: NormalizedDocument = {
      document_id: doc.document_id,
      template_id: doc.template_id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      type: doc.type,
      status: doc.status,
      errors: (doc.errors ?? []).map((e: TDocumentError) => ({
        code: e?.code ?? '',
        message: e?.msg ?? '',
      })),
      warnings: (doc.warnings ?? []).map((w: TDocumentError) => ({
        code: w?.code ?? '',
        message: w?.msg ?? '',
      })),
      get_url: doc.presigned_url ?? null,
      edit_url: null,
      content: null,
      lang: doc.lang,
    };

    switch (doc.document_type) {
      case 'context':
        context.push(normalized);
        break;
      case 'transcript':
        transcript.push(normalized);
        break;
      default:
        docs.push(normalized);
        break;
    }
  }

  // API returns documents sorted by created_at desc (newest first).
  // Reverse so newest appears at the end (rightmost tab).
  docs.reverse();

  return { context, transcript, documents: docs };
}
