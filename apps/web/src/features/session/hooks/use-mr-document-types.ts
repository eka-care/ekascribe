'use client';

import { useEffect, useState } from 'react';
import fetchWrapper from '@/fetch-client';
import { GET_HUB_HOST } from '@/fetch-client/helper';
import useVoice2RxStore from '@/store/store';
import { getStorage } from '@/platform';
import type { DocumentTypeConfig } from '@eka-care/medical-records-ui';

const CONFIG_KEYS = 'mr_document_type,denial_list';

type ConfigResponse = {
  mr_document_type?: DocumentTypeConfig[];
  denial_list?: string[];
};

/** localStorage key, scoped per business so a workspace switch can't show
 * another workspace's document types. */
const cacheKey = (bid: string) => `mr_document_types:${bid}`;

const readCache = (bid: string): DocumentTypeConfig[] | null => {
  try {
    const raw = getStorage().local.get(cacheKey(bid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DocumentTypeConfig[]) : null;
  } catch {
    return null;
  }
};

const writeCache = (bid: string, types: DocumentTypeConfig[]) => {
  try {
    getStorage().local.set(cacheKey(bid), JSON.stringify(types));
  } catch {
    /* quota / disabled storage — non-fatal */
  }
};

/**
 * Workspace's medical-record document types (`mr_document_type`). Records store
 * the short `id` (e.g. "ps"); the feature shows `display_name` ("Prescription").
 *
 * Cached in localStorage (per business) so labels are available instantly on
 * every load — even before the API responds, or if it fails this time. On
 * mount we seed from the cache, then fetch in the background and refresh both
 * the state and the cache. This removes the "sometimes the names come,
 * sometimes they don't" flakiness.
 */
/** Shallow-equal by id+display_name, so we keep a STABLE array reference when
 *  the cache and the fresh fetch carry the same data (avoids re-render churn). */
const sameTypes = (a: DocumentTypeConfig[], b: DocumentTypeConfig[]) =>
  a.length === b.length &&
  a.every((t, i) => t.id === b[i].id && t.display_name === b[i].display_name);

export interface MrConfig {
  documentTypes: DocumentTypeConfig[];
  allowUpload: boolean;
}

export const useMrDocumentTypes = (): MrConfig => {
  const businessID = useVoice2RxStore((state) => state.loggedInUserDetails?.['b-id']);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeConfig[]>(() =>
    businessID ? readCache(businessID) ?? [] : [],
  );
  const [allowUpload, setAllowUpload] = useState(true);

  useEffect(() => {
    if (!businessID) return;
    let cancelled = false;

    const cached = readCache(businessID);
    if (cached) setDocumentTypes((prev) => (sameTypes(prev, cached) ? prev : cached));

    (async () => {
      try {
        const url = `${GET_HUB_HOST()}/onboarding/5/configuration/?config_keys=${CONFIG_KEYS}&format=json`;
        const res = await fetchWrapper(url, { method: 'GET' });
        if (!res.ok || cancelled) return;
        const data: ConfigResponse = await res.json();
        const types = (data.mr_document_type ?? []).filter((t) => !t.archive);
        if (types.length > 0) {
          writeCache(businessID, types);
          if (!cancelled) setDocumentTypes((prev) => (sameTypes(prev, types) ? prev : types));
        }
        if (!cancelled) {
          const denialList = data.denial_list ?? [];
          setAllowUpload(!denialList.includes('UPLOAD_MEDICAL_RECORDS'));
        }
      } catch {
        // Non-fatal: cached/SDK-static labels remain in effect.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [businessID]);

  return { documentTypes, allowUpload };
};
