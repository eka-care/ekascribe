import type { IPrinter } from '../contracts';

/**
 * Web printing. Renders the prepared document HTML in a hidden iframe and invokes the
 * browser print dialog, cleaning up after `afterprint`. DOM is touched only inside the
 * method, so the module is SSR-safe. No `htmlToPdf` — web has no native PDF export.
 */
export class PrinterWebImpl implements IPrinter {
  async printHtml(html: string): Promise<void> {
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

export const printerWeb: IPrinter = new PrinterWebImpl();
