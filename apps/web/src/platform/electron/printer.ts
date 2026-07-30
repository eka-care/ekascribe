import type { IPrinter } from '../contracts';

/**
 * Electron printer adapter. Prefers host printing/PDF (`window.printApi.*`, feature-detected
 * P4); when the bridge is absent it degrades to the same hidden-iframe browser print the web
 * impl uses, so desktop never crashes before DeskDocEka ships the bridge.
 */
export class PrinterElectronImpl implements IPrinter {
  async printHtml(html: string): Promise<void> {
    if (typeof window.printApi?.printHtml === 'function') {
      await window.printApi.printHtml(html);
      return;
    }
    this.iframePrint(html);
  }

  async htmlToPdf(html: string): Promise<Blob> {
    if (typeof window.printApi?.htmlToPdf === 'function') {
      const buffer = await window.printApi.htmlToPdf(html);
      return new Blob([buffer], { type: 'application/pdf' });
    }
    // No native PDF without the host bridge — fall back to the print dialog.
    this.iframePrint(html);
    return new Blob([], { type: 'application/pdf' });
  }

  private iframePrint(html: string): void {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      const cleanup = () => {
        URL.revokeObjectURL(url);
        document.body.removeChild(iframe);
      };
      if (iframe.contentWindow) {
        iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
        iframe.contentWindow.print();
      } else {
        cleanup();
      }
    };
  }
}

export const printerElectron: IPrinter = new PrinterElectronImpl();
