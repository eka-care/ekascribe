import type { IClipboard } from '../contracts';

/**
 * Browser clipboard via the async Clipboard API. Both flavours write a `ClipboardItem`
 * (rich HTML + plain-text together) so consumers can paste into rich or plain targets.
 * `navigator.clipboard` / `ClipboardItem` are touched only inside methods, so the module
 * is safe to import during SSR.
 */
export class ClipboardWebImpl implements IClipboard {
  async writeText(text: string): Promise<void> {
    const item = new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  }

  async writeRich(html: string, text = ''): Promise<void> {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  }
}

export const clipboardWeb: IClipboard = new ClipboardWebImpl();
