import { createWorkerBlobUrl } from '@eka-care/ekascribe-ts-sdk';

const WORKER_CDN_URL =
  'https://cdn.jsdelivr.net/npm/med-scribe-alliance-ts-sdk@latest/dist/worker.bundle.js';

let cachedWorkerUrl: string | null = null;

export async function createSharedWorkerUrl(): Promise<string | undefined> {
  if (cachedWorkerUrl) return cachedWorkerUrl;
  try {
    cachedWorkerUrl = await createWorkerBlobUrl(WORKER_CDN_URL);
    return cachedWorkerUrl;
  } catch {
    return undefined;
  }
}
