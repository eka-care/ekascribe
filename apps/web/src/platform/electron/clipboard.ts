import type { IClipboard } from '../contracts';

/**
 * Electron clipboard adapter. The renderer has a real `navigator.clipboard`, so writes go
 * there today; once DeskDocEka exposes `window.clipboardApi.write`, payloads are routed to
 * the host instead (feature-detected, P4). Absent bridge → browser path, no crash.
 */
export class ClipboardElectronImpl implements IClipboard {
  async writeText(text: string): Promise<void> {
    if (typeof window.clipboardApi?.write === 'function') {
      await window.clipboardApi.write({ text });
      return;
    }
    const item = new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  }

  async writeRich(html: string, text = ''): Promise<void> {
    if (typeof window.clipboardApi?.write === 'function') {
      await window.clipboardApi.write({ html, text });
      return;
    }
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  }
}

export const clipboardElectron: IClipboard = new ClipboardElectronImpl();
