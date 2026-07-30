/**
 * Clipboard. Web → `navigator.clipboard`; electron → `window.clipboardApi.write()`.
 */
export interface IClipboard {
  writeText(text: string): Promise<void>;
  /** Write rich content; `text` is the plain-text fallback. */
  writeRich(html: string, text?: string): Promise<void>;
}
