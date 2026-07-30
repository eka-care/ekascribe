import { generateJSON } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import Showdown from 'showdown';
import { buildDefaultEditorExtensions } from '../components/editor/tiptap-wysiwyg-editor';
import { sanitizeHtmlForNote } from './html-sanitize';

const showdownConverter = new Showdown.Converter({ tables: true });

export function markdownToTiptapJson(markdown: string): JSONContent {
  const html = sanitizeHtmlForNote(showdownConverter.makeHtml(markdown || ''));
  return generateJSON(html, buildDefaultEditorExtensions());
}

export function htmlToTiptapJson(html: string): JSONContent {
  return generateJSON(sanitizeHtmlForNote(html || ''), buildDefaultEditorExtensions());
}
