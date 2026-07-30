/**
 * Printer / PDF export. Web → hidden iframe + `window.print()`; electron →
 * `window.printApi.htmlToPdf()` for true native PDF export.
 */
export interface IPrinter {
  printHtml(html: string): Promise<void>;
  /**
   * Native HTML→PDF, electron-only. Web omits it (no native PDF and no consumer); callers
   * must feature-check (`printer.htmlToPdf?.(…)`) and fall back to `printHtml`.
   */
  htmlToPdf?(html: string): Promise<Blob>;
}
