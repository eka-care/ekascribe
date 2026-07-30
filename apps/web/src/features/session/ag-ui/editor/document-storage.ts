/**
 * Dual storage payload and load-time fallback logic.
 *
 * Save: editor.getJSON() + markdown serialization → both sent together.
 * Load: try JSON → try parsed markdown → raw markdown as plain text.
 *
 * Backend integration is stubbed — the types and helpers are ready,
 * actual wiring happens when the backend accepts the new payload shape.
 */

import { generateJSON, type JSONContent } from '@tiptap/core';
import Showdown from 'showdown';

import { buildScribeEditorExtensions } from './editor-extensions';

export type DocumentSavePayload = {
  tiptap_json: JSONContent | null;
  markdown: string | null;
};

export type DocumentLoadResult = {
  content: JSONContent;
  degraded: boolean;
  error?: string;
};

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const showdownConverter = new Showdown.Converter({ tables: true });

/**
 * Builds the save payload from the editor.
 * If markdown serialization fails, sends JSON only.
 */
export function buildSavePayload(
  getJSON: () => JSONContent,
  getMarkdown: () => string
): DocumentSavePayload {
  const tiptap_json = getJSON();
  let markdown: string | null = null;
  try {
    markdown = getMarkdown();
  } catch (e) {
    console.warn('[document-storage] markdown serialization failed, saving JSON only', e);
  }
  return { tiptap_json, markdown };
}

/**
 * Loads a document with fallback:
 * 1. Try tiptap_json → validate + return
 * 2. Try markdown → parse to Tiptap JSON → return (degraded)
 * 3. Raw markdown as plain text paragraph → return (degraded)
 */
export function loadDocument(data: {
  tiptap_json?: JSONContent | null;
  markdown?: string | null;
}): DocumentLoadResult {
  // Attempt 1: Load Tiptap JSON directly
  if (data.tiptap_json) {
    try {
      validateTiptapJson(data.tiptap_json);
      return { content: data.tiptap_json, degraded: false };
    } catch (e) {
      console.warn('[document-storage] JSON load failed, trying markdown fallback', e);
    }
  }

  // Attempt 2: Parse markdown into Tiptap JSON
  if (data.markdown) {
    try {
      const content = parseMarkdownToTiptap(data.markdown);
      return {
        content,
        degraded: true,
        error: 'This document was restored from a backup. Some interactive features may be limited.',
      };
    } catch (e) {
      console.warn('[document-storage] markdown parse failed, falling back to plain text', e);
    }

    // Attempt 3: Raw markdown as plain text
    return {
      content: {
        type: 'doc',
        content: data.markdown.split('\n').map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        })),
      },
      degraded: true,
      error: 'This document could not be fully restored. Displaying as plain text.',
    };
  }

  return { content: EMPTY_DOC, degraded: false };
}

function validateTiptapJson(json: JSONContent): void {
  if (!json || typeof json !== 'object') throw new Error('Invalid JSON: not an object');
  if (json.type !== 'doc') throw new Error('Invalid JSON: root type is not "doc"');
  if (!Array.isArray(json.content) || json.content.length === 0) {
    throw new Error('Invalid JSON: empty or missing content');
  }
}

function parseMarkdownToTiptap(markdown: string): JSONContent {
  const html = showdownConverter.makeHtml(markdown);
  const extensions = buildScribeEditorExtensions();
  const json = generateJSON(html, extensions) as JSONContent;
  if (!json?.content?.length) throw new Error('Parsed markdown produced empty document');
  return json;
}
