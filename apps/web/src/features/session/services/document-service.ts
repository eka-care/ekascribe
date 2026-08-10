import { with401Retry } from '@/fetch-client/api-with-retry';
import { getTransport } from '@/transport';
import * as sdkService from './sdk-service';
import { getSDK } from './sdk-provider';
import useVoice2RxStore from '@/store/store';
import { formatDate } from '@/utils/format-date-time';
import { getPlatform } from '@/platform';
import type { NormalizedDocument } from '../types';
import { tracker } from '@/analytics';

function getCompactPrintSetting(): boolean {
  // return Boolean(useVoice2RxStore.getState().appConfig.print_compact);
  return false;
}

// --- Decode / Encode ---

function decodeUnicodeBase64(str: string): string {
  try {
    const binaryString = atob(str);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (error) {
    console.error('Error decoding base64 string:', error);
    return '';
  }
}

function encodeToBase64(content: string): string {
  const utf8Bytes = new TextEncoder().encode(content);
  return btoa(Array.from(utf8Bytes, (byte) => String.fromCharCode(byte)).join(''));
}

// --- Presigned URL fetching ---

export async function fetchEditUrl(sessionId: string, docId: string): Promise<string | null> {
  try {
    const response = await with401Retry(
      () => sdkService.updateDocument({ document_id: docId, session_id: sessionId }),
      'fetch document edit url'
    );
    if (response.status_code >= 400 || !response.data?.presigned_url) return null;
    const url = response.data.presigned_url as string;
    useVoice2RxStore.getState().setSessionV2Document(sessionId, docId, { edit_url: url });

    return url;
  } catch {
    return null;
  }
}

export async function fetchGetUrl(sessionId: string, docId: string): Promise<string | null> {
  try {
    const response = await with401Retry(
      () => sdkService.getDocument({ documentId: docId }),
      'fetch document get url'
    );
    if (response.status_code >= 400 || !response.data?.presigned_url) return null;
    const url = response.data.presigned_url as string;
    useVoice2RxStore.getState().setSessionV2Document(sessionId, docId, { get_url: url });

    return url;
  } catch {
    return null;
  }
}

export type FetchDocumentJsonResult = {
  tiptapJson: unknown | null;
  presignedUrl: string | null;
};

export async function fetchDocumentJson(
  sessionId: string,
  docId: string
): Promise<FetchDocumentJsonResult> {
  try {
    const response = await with401Retry(
      () =>
        sdkService.getDocument({
          documentId: docId,
        }),
      'fetch document'
    );
    if (response.status_code >= 400 || !response.data) {
      return { tiptapJson: null, presignedUrl: null };
    }
    const data = response.data;
    const presignedUrl = data.presigned_url ?? null;
    const docStatus = (data as Record<string, unknown>).status as string | undefined;

    useVoice2RxStore.getState().setSessionV2Document(sessionId, docId, {
      get_url: presignedUrl,
      ...(docStatus ? { status: docStatus } : {}),
    });

    const tiptapJson = data.tiptap_json ?? (data as Record<string, unknown>).tip_tap_data ?? null;

    return {
      tiptapJson,
      presignedUrl,
    };
  } catch {
    return { tiptapJson: null, presignedUrl: null };
  }
}

// --- Content I/O ---

const MIN_SKELETON_MS = 500;

export async function fetchDocumentContent(
  sessionId: string,
  docId: string,
  getUrl: string | null,
  isTranscript: boolean = false
): Promise<string | null> {
  // Run fetch and a minimum delay timer in parallel so the caller
  // (and any skeleton UI) always waits at least MIN_SKELETON_MS.
  const [result] = await Promise.all([
    (async (): Promise<string | null> => {
      let url = getUrl;

      if (!url) {
        url = await fetchGetUrl(sessionId, docId);
        if (!url) return null;
      }

      try {
        const transport = getTransport();
        let response = await transport.request(url);
        if (!response.ok) {
          url = await fetchGetUrl(sessionId, docId);
          if (!url) return null;
          response = await transport.request(url);
          if (!response.ok) return null;
        }
        const rawContent = await response.text();
        return isTranscript ? rawContent : decodeUnicodeBase64(rawContent);
      } catch {
        return null;
      }
    })(),
    new Promise<void>((resolve) => setTimeout(resolve, MIN_SKELETON_MS)),
  ]);

  return result;
}

export async function saveDocumentJson(
  sessionId: string,
  docId: string,
  tiptapJson: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await with401Retry(
      () =>
        sdkService.updateDocument({
          document_id: docId,
          session_id: sessionId,
          tiptap_json: tiptapJson,
          params: 'tiptap_json=true',
        }),
      'save document json'
    );
    return response.status_code < 400;
  } catch (error) {
    tracker.error(error, {
      domain: 'api',
      component: 's3',
      extra: { action: 'save_document_json', session_id: sessionId, doc_id: docId },
    });
    return false;
  }
}

export async function saveDocumentContent(
  sessionId: string,
  docId: string,
  content: string,
  editUrl: string | null
): Promise<boolean> {
  let url = editUrl;

  if (!url) {
    url = await fetchEditUrl(sessionId, docId);
    if (!url) return false;
  }

  const encoded = encodeToBase64(content);
  const success = await putToS3(url, encoded);

  if (!success) {
    url = await fetchEditUrl(sessionId, docId);
    if (!url) return false;
    return putToS3(url, encoded);
  }

  return true;
}

async function putToS3(presignedUrl: string, content: string): Promise<boolean> {
  try {
    const res = await getTransport().request(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: content,
    });
    return res.ok;
  } catch (error) {
    tracker.error(error, { domain: 'api', component: 's3', extra: { action: 'put_to_s3' } });
    return false;
  }
}

// --- Document actions (SDK + store sync) ---

export async function addNote(
  sessionId: string,
  name: string,
  type?: string,
  options?: { skipStoreUpdate?: boolean }
): Promise<NormalizedDocument | null> {
  try {
    const response = await with401Retry(
      () =>
        sdkService.createDocument({
          session_id: sessionId,
          document_name: name,
          ...(type ? { type } : {}),
        }),
      'create document'
    );

    if (response.status_code >= 400 || !response.data?.document_id) return null;

    const newDoc: NormalizedDocument = {
      document_id: response.data.document_id,
      template_id: response.data.template_id || '',
      document_name: name,
      document_type: 'notes',
      type: type || 'markdown',
      status: 'success',
      errors: [],
      warnings: [],
      get_url: null,
      edit_url: (response.data.presigned_url as string) || null,
      content: null,
    };

    if (!options?.skipStoreUpdate) {
      useVoice2RxStore.getState().addSessionV2Document(sessionId, newDoc);
    }
    return newDoc;
  } catch (error) {
    console.error('addNote error:', error);
    return null;
  }
}

export async function deleteNote(sessionId: string, documentId: string): Promise<boolean> {
  const prevDoc = useVoice2RxStore
    .getState()
    .sessionV2ContentById[sessionId]?.documents.find((d) => d.document_id === documentId);

  useVoice2RxStore.getState().removeSessionV2Document(sessionId, documentId);

  try {
    const response = await with401Retry(
      () => sdkService.deleteDocument(documentId),
      'delete document'
    );

    if (response.status_code >= 400) {
      if (prevDoc) useVoice2RxStore.getState().addSessionV2Document(sessionId, prevDoc);
      return false;
    }
    return true;
  } catch (error) {
    console.error('deleteNote error:', error);
    if (prevDoc) useVoice2RxStore.getState().addSessionV2Document(sessionId, prevDoc);
    return false;
  }
}

export async function renameDocument(
  sessionId: string,
  documentId: string,
  newName: string
): Promise<boolean> {
  const prevDoc = useVoice2RxStore
    .getState()
    .sessionV2ContentById[sessionId]?.documents.find((d) => d.document_id === documentId);
  const prevName = prevDoc?.document_name;

  useVoice2RxStore.getState().setSessionV2Document(sessionId, documentId, {
    document_name: newName,
  });

  try {
    const response = await with401Retry(
      () =>
        sdkService.updateDocument({
          document_id: documentId,
          session_id: sessionId,
          document_name: newName,
        }),
      'update document'
    );

    if (response.status_code >= 400) {
      if (prevName !== undefined) {
        useVoice2RxStore.getState().setSessionV2Document(sessionId, documentId, {
          document_name: prevName,
        });
      }
      return false;
    }
    return true;
  } catch (error) {
    console.error('renameDocument error:', error);
    if (prevName !== undefined) {
      useVoice2RxStore.getState().setSessionV2Document(sessionId, documentId, {
        document_name: prevName,
      });
    }
    return false;
  }
}

// --- Doctor header/footer ---

type DoctorHeaderFooter = {
  headerImage?: string;
  footerImage?: string;
  headerWidth?: string;
  footerWidth?: string;
  headerHeight?: string;
  footerHeight?: string;
  headerTopMargin?: string;
};

type V2PrintSection =
  | {
      type: 'image';
      url: string;
      width: number;
      height: number;
      unit: 'cm' | 'mm';
    }
  | {
      type: 'margin';
      width: number;
      height: number;
      unit: 'cm' | 'mm';
    };

function dimToCss(value: number, unit: 'cm' | 'mm'): string {
  // Always emit cm for CSS (browsers handle both, but we standardise).
  const cm = unit === 'mm' ? value / 10 : value;
  return `${cm}cm`;
}

export async function fetchPrintHeaderFooter(): Promise<DoctorHeaderFooter> {
  try {
    const resp = await with401Retry(() => getSDK().sessions.getConfig(), 'get config for print');
    const data = resp.data as
      | { header?: V2PrintSection | null; footer?: V2PrintSection | null }
      | undefined;
    if (!data) return {};

    const headerImage = data.header?.type === 'image' ? data.header.url : undefined;
    const footerImage = data.footer?.type === 'image' ? data.footer.url : undefined;
    const headerWidth = data.header ? dimToCss(data.header.width, data.header.unit) : undefined;
    const footerWidth = data.footer ? dimToCss(data.footer.width, data.footer.unit) : undefined;
    const headerHeight = data.header ? dimToCss(data.header.height, data.header.unit) : undefined;
    const footerHeight = data.footer ? dimToCss(data.footer.height, data.footer.unit) : undefined;

    return {
      headerImage,
      footerImage,
      headerWidth,
      footerWidth,
      headerHeight,
      footerHeight,
    };
  } catch {
    return {};
  }
}

// --- Print / Preview ---

function collectPageStyles(): string {
  const baseTag = `<base href="${window.location.origin}" />`;
  const styleEls = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('\n');
  return baseTag + '\n' + styleEls;
}

function sanitizeContentForPrint(html: string, compact: boolean): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc
    .querySelectorAll(
      '.column-resize-handle, .grip-column, .grip-row, .tableControls, [id^="DndDescribedBy-"], [id^="DndLiveRegion-"]'
    )
    .forEach((el) => el.remove());

  doc.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim()) p.remove();
  });

  // Strip editor classes so page CSS (.tiptap th { border:none } etc.) won't conflict
  doc.querySelectorAll('.tiptap').forEach((el) => {
    el.classList.remove('tiptap', 'ProseMirror');
  });
  doc.querySelectorAll('.scribe-editor').forEach((el) => {
    el.classList.remove('scribe-editor');
  });

  const cleanText = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

  const sectionTitle = (sectionEl: Element) =>
    cleanText(sectionEl.querySelector('header [data-section-title]')?.textContent);

  // Every compact section renders the same shape: the section title inline and
  // bold, then " | "-separated entries. An entry with a label prints
  // "<b>label</b>: detail"; a label-less entry (LIST, NARRATIVE) is plain text.
  const buildCompactLine = (headerText: string, entries: { label?: string; detail: string }[]) => {
    const p = doc.createElement('p');
    p.className = 'compact-line';

    if (headerText) {
      const headerStrong = doc.createElement('strong');
      headerStrong.textContent = `${headerText}: `;
      p.appendChild(headerStrong);
    }

    entries.forEach((entry, i) => {
      if (i > 0) p.appendChild(doc.createTextNode(' | '));
      if (entry.label) {
        const labelStrong = doc.createElement('strong');
        labelStrong.textContent = entry.label;
        p.appendChild(labelStrong);
        if (entry.detail) p.appendChild(doc.createTextNode(`: ${entry.detail}`));
      } else if (entry.detail) {
        p.appendChild(doc.createTextNode(entry.detail));
      }
    });

    return p;
  };

  if (compact) {
    doc.querySelectorAll('.scribe-section[data-kind="LIST"]').forEach((sectionEl) => {
      const bodyEl = sectionEl.querySelector('header + div');
      const items = Array.from(bodyEl?.querySelectorAll('li') ?? [])
        .map((li) => cleanText(li.textContent))
        .filter(Boolean);
      if (items.length === 0) return;

      sectionEl.replaceWith(
        buildCompactLine(sectionTitle(sectionEl), [{ detail: items.join(', ') }])
      );
    });
  }

  // Compact print: a generic TABLE-kind section collapses to one line —
  // "Header: col0: col1 col2 | col0: col1 col2".
  // These render via TipTap's plain Table/TableHeader/TableCell (no NodeView), so
  // it's one <tbody> with the header row using <th> and data rows using <td>.
  if (compact) {
    doc.querySelectorAll('.scribe-section[data-kind="TABLE"]').forEach((sectionEl) => {
      const tableEl = sectionEl.querySelector('table');
      if (!tableEl) return;

      const rows = Array.from(tableEl.querySelectorAll('tr'))
        .filter((tr) => tr.querySelector('td'))
        .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => cleanText(td.textContent)))
        .filter((cells) => cells.some(Boolean));
      if (rows.length === 0) return;

      const entries = rows.map(([first, ...rest]) => ({
        label: first,
        detail: rest.filter(Boolean).join(' '),
      }));

      sectionEl.replaceWith(buildCompactLine(sectionTitle(sectionEl), entries));
    });
  }

  // Compact print: a KEY_VALUE-kind section (.kv-item rows: key <input> + value <div>)
  // collapses the same way — "Header: key1: value1 | key2: value2". Visually tabular
  // (two-column grid) but not an actual <table>, so this needs its own selector.
  if (compact) {
    doc.querySelectorAll('.scribe-section[data-kind="KEY_VALUE"]').forEach((sectionEl) => {
      const bodyEl = sectionEl.querySelector('header + div');
      const items = Array.from(bodyEl?.querySelectorAll('.kv-item') ?? [])
        .map((item) => {
          const keyInput = item.children[0];
          const valueDiv = item.children[1];
          return {
            key: cleanText(keyInput?.getAttribute('value')),
            value: cleanText(valueDiv?.textContent),
          };
        })
        .filter((kv) => kv.key || kv.value);
      if (items.length === 0) return;

      const entries = items.map((kv) => ({ label: kv.key, detail: kv.value }));

      sectionEl.replaceWith(buildCompactLine(sectionTitle(sectionEl), entries));
    });
  }

  // Compact print: a NARRATIVE-kind section is free-form prose (paragraphs,
  // headings, lists), so its whole body collapses onto the title line —
  // "Chief Complaint: Fever since 3 days. Mild headache."
  if (compact) {
    doc.querySelectorAll('.scribe-section[data-kind="NARRATIVE"]').forEach((sectionEl) => {
      const bodyEl = sectionEl.querySelector('header + div');
      if (!bodyEl) return;

      const text = Array.from(bodyEl.children)
        .map((child) =>
          child.tagName === 'UL' || child.tagName === 'OL'
            ? Array.from(child.querySelectorAll(':scope > li'))
                .map((li) => cleanText(li.textContent))
                .filter(Boolean)
                .join(', ')
            : cleanText(child.textContent)
        )
        .filter(Boolean)
        .join(' ');
      if (!text) return;

      sectionEl.replaceWith(buildCompactLine(sectionTitle(sectionEl), [{ detail: text }]));
    });
  }

  doc.querySelectorAll('table').forEach((table) => {
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    bodyRows.forEach((tr) => {
      const isEmpty = Array.from(tr.children).every((cell) => !cell.textContent?.trim());
      if (isEmpty) tr.remove();
    });

    const remainingRows = Array.from(table.querySelectorAll('tbody tr'));
    if (remainingRows.length === 0) {
      table.remove();
      return;
    }

    const headerRow = table.querySelector('thead tr');
    const colCount = remainingRows.reduce((max, tr) => Math.max(max, tr.children.length), 0);
    for (let c = colCount - 1; c >= 0; c--) {
      const hasData = remainingRows.some((tr) => tr.children[c]?.textContent?.trim());
      if (hasData) continue;
      headerRow?.children[c]?.remove();
      remainingRows.forEach((tr) => tr.children[c]?.remove());
    }
  });

  doc.querySelectorAll('.tableWrapper').forEach((wrap) => {
    (wrap as HTMLElement).style.cssText +=
      'overflow:visible !important;border-radius:8px !important;';
  });
  doc.querySelectorAll('table').forEach((table) => {
    (table as HTMLElement).style.cssText +=
      'border-collapse:collapse !important;border:1px solid #888 !important;' +
      'border-radius:0 !important;overflow:visible !important;';
  });
  const cellPadding = compact ? '2px 4px' : '4px 8px';
  doc.querySelectorAll('th, td').forEach((cell) => {
    (
      cell as HTMLElement
    ).style.cssText = `border:1px solid #888 !important;padding:${cellPadding} !important;`;
  });

  return doc.body.innerHTML;
}

function buildDocumentHtml(
  contentHtml: string,
  hf: DoctorHeaderFooter,
  patientLine?: string,
  mode: 'print' | 'preview' = 'print',
  compact: boolean = false
): string {
  const useDefaultHeader = !hf.headerImage && !hf.headerHeight;
  const useDefaultFooter = !hf.footerImage && !hf.footerHeight;

  const {
    headerImage,
    footerImage,
    headerWidth = '100%',
    footerWidth = '100%',
    headerHeight = useDefaultHeader ? '1.9cm' : '3cm',
    footerHeight = useDefaultFooter ? '1.2cm' : '3.5cm',
    headerTopMargin = '0',
  } = hf;

  const pageStyles = collectPageStyles();
  const styledContentHtml = sanitizeContentForPrint(contentHtml, compact);
  const cellPadding = compact ? '2px 4px' : '4px 8px';

  // If the v2 config returns type=margin (no image but a height), render an
  // empty white frame at the same position so the configured margin is
  // reserved as visible white space on every page.
  const hasHeaderHeight = !!hf.headerHeight;
  const hasFooterHeight = !!hf.footerHeight;

  // Built-in neutral branding used when the deployment hasn't configured
  // its own header/footer images.
  const defaultHeaderHtml = `<div class="print-header-frame print-brand-header">
      <svg width="26" height="26" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="scribe-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#215FFF"/><stop offset="1" stop-color="#4535B0"/></linearGradient></defs><rect width="28" height="28" rx="7" fill="url(#scribe-g)"/><g stroke="#fff" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="11" x2="8" y2="17"/><line x1="12" y1="8" x2="12" y2="20"/><line x1="16" y1="10" x2="16" y2="18"/><line x1="20" y1="12" x2="20" y2="16"/></g></svg>
      <span class="print-brand-name">scribe</span>
    </div>`;
  const defaultFooterHtml = `<div class="print-footer-frame print-brand-footer">Generated with scribe</div>`;

  const headerImgTag = headerImage
    ? `<div class="print-header-frame"><img class="print-hf-img print-header-img" src="${headerImage}" /></div>`
    : hasHeaderHeight
    ? `<div class="print-header-frame"></div>`
    : defaultHeaderHtml;
  const footerImgTag = footerImage
    ? `<div class="print-footer-frame"><img class="print-hf-img print-footer-img" src="${footerImage}" /></div>`
    : hasFooterHeight
    ? `<div class="print-footer-frame"></div>`
    : defaultFooterHtml;
  const patientLineHtml = patientLine ? `<div class="print-patient-line">${patientLine}</div>` : '';

  const sharedStyles = `
    body {
      margin: 0;
      padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-patient-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 24px;
      font-size: 14px;
      color: #1a1a1a;
      background: #f8f8f8;
      border-bottom: 1px solid #d1d1d1;
    }
    .print-patient-line .patient-name {
      font-weight: 700;
      font-style: italic;
      font-size: 16px;
    }
    .print-patient-line .separator {
      margin: 0 8px;
      color: #999;
    }
    .print-patient-line .print-date {
      color: #555;
      white-space: nowrap;
    }
    .print-body {
      padding: 0 8px;
    }
    .print-body .tableWrapper {
      overflow: visible !important;
      border-radius: 8px !important;
    }
    .print-body table,
    .print-body .tiptap table {
      border-collapse: collapse !important;
      width: 100%;
      max-width: 100%;
      table-layout: fixed !important;
      border: 1px solid #888 !important;
      border-radius: 0 !important;
      overflow: visible !important;
      background: white !important;
      font-size: 11px !important;
    }
    .print-body table th,
    .print-body table td,
    .print-body .tiptap th,
    .print-body .tiptap td,
    .print-body .tiptap th:first-child,
    .print-body .tiptap td:first-child {
      border-top: 1px solid #888 !important;
      border-right: 1px solid #888 !important;
      border-bottom: 1px solid #888 !important;
      border-left: 1px solid #888 !important;
      padding: 3px 6px !important;
      min-width: 0 !important;
      word-break: normal;
      overflow-wrap: break-word;
    }
    .print-body table th,
    .print-body .tiptap th,
    .print-body table thead,
    .print-body .tiptap thead {
      background: #F9FAFB !important;
      color: #191919 !important;
      font-weight: 600;
      text-align: left !important;
    }
    .print-body {
      max-width: 21cm;
      overflow: hidden;
    }
    button, [data-no-print], .wysiwyg-wrapper > div:first-child:has(button) {
      display: none !important;
    }
    .overflow-y-auto, .overflow-hidden {
      overflow: visible !important;
      max-height: none !important;
      height: auto !important;
    }
    .h-full, .min-h-0, .flex-1 {
      height: auto !important;
      min-height: auto !important;
    }
    .bg-\\[\\#FAFAFA\\] {
      background: white !important;
    }
    /* Typography — replaces stripped .scribe-editor / .tiptap spacing */
    .print-body p {
      font-size: 0.8125rem;
      line-height: 1.65;
      color: #2b3447;
      margin: 8px 0;
    }
    .print-body p:first-child { margin-top: 0; }
    .print-body p:last-child { margin-bottom: 0; }
    .print-body ul {
      margin: 6px 0 12px;
      padding: 0 0 0 22px;
      list-style-type: disc;
    }
    .print-body ol {
      margin: 6px 0 12px;
      padding: 0 0 0 22px;
      list-style-type: decimal;
    }
    .print-body li {
      padding: 3px 0;
      font-size: 0.8125rem;
      color: #2b3447;
      line-height: 1.55;
    }
    .print-body li + li { margin-top: 1px; }
    .print-body li p { margin: 0; }
    .print-body li > strong:first-child {
      color: #0b1220;
      font-weight: 600;
    }
    .print-body table {
      margin: 10px 0 14px;
    }
    .print-body h1, .print-body h2, .print-body h3 {
      color: #0b1220;
    }`;

  const compactStyles = compact
    ? `
    .print-body p {
      font-size: 0.75rem;
      line-height: 1.3;
      margin: 2px 0;
    }
    .print-body .compact-line {
      margin: 8px 0 !important;
    }
    .print-body ul, .print-body ol {
      margin: 2px 0 4px;
      padding: 0 0 0 18px;
    }
    .print-body li {
      padding: 0;
      font-size: 0.75rem;
      line-height: 1.25;
    }
    .print-body h1, .print-body h2, .print-body h3 {
      margin: 4px 0 2px;
    }
    .print-body .scribe-section {
      padding-top: 2px !important;
      padding-bottom: 1px !important;
    }
    .print-body .scribe-section header {
      padding-bottom: 0 !important;
      margin-bottom: 0 !important;
      border-bottom: none !important;
    }
    /* Whatever comes right after the header — paragraph, list, table, kv-item —
       loses its own top margin, so there's no gap regardless of content type. */
    .print-body .scribe-section *:first-child {
      margin-top: 0 !important;
    }
    .print-patient-line {
      padding: 4px 24px !important;
    }
    .print-body .kv-item {
      padding-top: 1px !important;
      padding-bottom: 1px !important;
    }
    .print-body table,
    .print-body .tiptap table {
      font-size: 10px !important;
      margin: 3px 0 4px !important;
    }
    .print-body table th,
    .print-body table td,
    .print-body .tiptap th,
    .print-body .tiptap td {
      padding: ${cellPadding} !important;
    }`
    : '';

  if (mode === 'preview') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  ${pageStyles}
  <style>
    ${sharedStyles}
    ${compactStyles}
    .print-brand-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 24px 10px;
      border-bottom: 1px solid #E5E7EB;
      box-sizing: border-box;
      background: white;
    }
    .print-brand-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #1A1A1A;
    }
    .print-brand-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      padding-top: 8px;
      border-top: 1px solid #E5E7EB;
      box-sizing: border-box;
      font-size: 10px;
      color: #9CA3AF;
      background: white;
    }
    .print-header-frame {
      width: ${headerWidth};
      max-width: 100%;
      height: ${headerHeight};
      margin: ${headerTopMargin} auto 0;
      overflow: hidden;
    }
    .print-footer-frame {
      width: ${footerWidth};
      max-width: 100%;
      height: ${footerHeight};
      margin: 0 auto;
      overflow: hidden;
    }
    .print-hf-img {
      display: block;
      width: 100%;
      height: auto;
      min-height: 100%;
      object-fit: cover;
    }
    .print-header-img { object-position: top; }
    .print-footer-img { object-position: bottom; }
  </style>
</head>
<body>
  ${headerImgTag}
  ${patientLineHtml}
  <div class="print-body">${styledContentHtml}</div>
  ${footerImgTag}
  <style>.print-body th,.print-body td{border:1px solid #888 !important;padding:${cellPadding} !important}.print-body table{border-collapse:collapse !important;border:1px solid #888 !important}</style>
</body>
</html>`;
  }

  // Print mode: position:fixed pins header/footer to every page edge.
  // Table thead/tfoot spacers reserve flow space so body content can't overlap
  // the fixed images on multi-page docs.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  ${pageStyles}
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    ${sharedStyles}
    ${compactStyles}
    @media print {
      .print-table > thead { display: table-header-group; }
      .print-table > tfoot { display: table-footer-group; }
      .print-body table thead { display: table-row-group; }
    }
    .print-header-frame {
      position: fixed;
      top: ${headerTopMargin};
      left: 0;
      right: 0;
      width: ${headerWidth};
      max-width: 100%;
      height: ${headerHeight};
      margin: 0 auto;
      overflow: hidden;
      background: white;
      z-index: 100;
    }
    .print-footer-frame {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: ${footerWidth};
      max-width: 100%;
      height: ${footerHeight};
      margin: 0 auto;
      overflow: hidden;
      background: white;
      z-index: 100;
    }
    .print-hf-img {
      display: block;
      width: 100%;
      height: auto;
      min-height: 100%;
      object-fit: cover;
    }
    .print-header-img { object-position: top; }
    .print-footer-img { object-position: bottom; }
    .print-table {
      width: 100%;
      border-collapse: collapse;
    }
    .print-table > thead > tr > td,
    .print-table > tfoot > tr > td,
    .print-table > tbody > tr > td {
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      background: none !important;
    }
    .print-header-spacer { height: ${headerHeight}; }
    .print-footer-spacer { height: ${footerHeight}; }
  </style>
</head>
<body>
  ${headerImgTag}
  ${footerImgTag}
  <table class="print-table">
    <thead><tr><td><div class="print-header-spacer"></div>${patientLineHtml}</td></tr></thead>
    <tfoot><tr><td><div class="print-footer-spacer"></div></td></tr></tfoot>
    <tbody><tr><td>
  <div class="print-body">${styledContentHtml}</div>
    </td></tr></tbody>
  </table>
  <style>.print-body th,.print-body td{border:1px solid #888 !important;padding:${cellPadding} !important}.print-body table{border-collapse:collapse !important;border:1px solid #888 !important}</style>
</body>
</html>`;
}

function printHtml(
  contentHtml: string,
  hf: DoctorHeaderFooter,
  patientLine?: string,
  compact: boolean = false
) {
  const html = buildDocumentHtml(contentHtml, hf, patientLine, 'print', compact);
  void getPlatform().printer?.printHtml(html);
}

const GENDER_LABEL: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

function buildPatientLine(sessionId: string): string | undefined {
  const sessionData = useVoice2RxStore.getState().sessionV2ContentById?.[sessionId];
  const patientDetails = sessionData?.patient_details;
  const createdAt = sessionData?.created_at;

  const { date, time } = formatDate(createdAt);

  const sep = '<span class="separator">|</span>';
  const parts: string[] = [];
  if (patientDetails?.username)
    parts.push(`<span class="patient-name">${patientDetails.username}</span>`);
  if (patientDetails?.age) parts.push(`${patientDetails.age} yrs`);
  if (patientDetails?.biologicalSex) parts.push(GENDER_LABEL[patientDetails.biologicalSex] || '');

  const filtered = parts.filter(Boolean);
  const dateStr = createdAt ? `${date}, ${time}` : '';

  if (filtered.length === 0) return undefined;

  const leftSide = filtered.join(sep);
  const rightSide = dateStr ? `<span class="print-date">${dateStr}</span>` : '';
  return `<span>${leftSide}</span>${rightSide}`;
}

async function resolveHeaderFooter(): Promise<DoctorHeaderFooter> {
  return fetchPrintHeaderFooter();
}

function capturePrintContentHtml(): string | null {
  const contentEl = document.querySelector('[data-print-content]');
  if (!contentEl) return null;
  // Sync input value properties to attributes so they survive innerHTML serialization
  contentEl.querySelectorAll('input').forEach((input) => {
    input.setAttribute('value', input.value);
  });
  contentEl.querySelectorAll('textarea').forEach((textarea) => {
    textarea.setAttribute('data-print-value', textarea.value);
  });
  return contentEl.innerHTML;
}

export const printDocument = async ({
  sessionId,
}: {
  documentId: string;
  sessionId: string;
  fallbackMarkdown?: string;
  documentName?: string;
}): Promise<void> => {
  const contentHtml = capturePrintContentHtml();
  if (!contentHtml) return;

  const hf = await resolveHeaderFooter();
  const patientLine = buildPatientLine(sessionId);
  printHtml(contentHtml, hf, patientLine, getCompactPrintSetting());
};

export const buildPrintPreviewHtml = async (sessionId: string): Promise<string | null> => {
  const contentHtml = capturePrintContentHtml();
  if (!contentHtml) return null;
  const hf = await resolveHeaderFooter();
  const patientLine = buildPatientLine(sessionId);

  return buildDocumentHtml(contentHtml, hf, patientLine, 'preview', getCompactPrintSetting());
};

/**
 * Render the current document to a PDF buffer via the printer capability's native HTML→PDF
 * (desktop only). Returns `null` when no native PDF export is available (e.g. web), so callers
 * can surface a friendly error rather than send a broken file.
 */
function toPdfFileName(fallbackName?: string): string {
  const safeName = (fallbackName || 'document').replace(/[^\w.-]+/g, '-');
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
}

export const buildDocumentPdfBuffer = async (
  sessionId: string,
  _documentId: string,
  fallbackName?: string
): Promise<{ buffer: ArrayBuffer; fileName: string } | null> => {
  const contentHtml = capturePrintContentHtml();
  if (!contentHtml) return null;

  const htmlToPdf = getPlatform().printer?.htmlToPdf;
  if (!htmlToPdf) return null;

  const hf = await resolveHeaderFooter();
  const patientLine = buildPatientLine(sessionId);
  const html = buildDocumentHtml(contentHtml, hf, patientLine, 'print', getCompactPrintSetting());

  const blob = await htmlToPdf(html);
  return { buffer: await blob.arrayBuffer(), fileName: toPdfFileName(fallbackName) };
};
