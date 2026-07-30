import type {
  IWhatsApp,
  SendWhatsAppDocumentPayload,
  SendWhatsAppDocumentResult,
  WhatsAppStatus,
  WhatsAppStatusInfo,
} from '../contracts';

/**
 * Electron WhatsApp adapter — thin pass-through to the host's `window.whatsappApi` bridge,
 * feature-detecting every method (P4). There is no browser fallback; this impl is only
 * registered when the bridge exists (see `electron/index.ts`), so callers reach it only on a
 * desktop host that ships WhatsApp. Each method still degrades safely if an individual
 * method is missing on an older host.
 */
export class WhatsAppElectronImpl implements IWhatsApp {
  async connect(): Promise<void> {
    if (typeof window.whatsappApi?.connect === 'function') {
      await window.whatsappApi.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (typeof window.whatsappApi?.disconnect === 'function') {
      await window.whatsappApi.disconnect();
    }
  }

  async getStatus(): Promise<WhatsAppStatusInfo> {
    if (typeof window.whatsappApi?.getStatus === 'function') {
      const info = await window.whatsappApi.getStatus();
      return { status: info.status as WhatsAppStatus, phoneNumber: info.phoneNumber };
    }
    return { status: 'disconnected' };
  }

  async sendDocument(payload: SendWhatsAppDocumentPayload): Promise<SendWhatsAppDocumentResult> {
    if (typeof window.whatsappApi?.sendDocument === 'function') {
      return window.whatsappApi.sendDocument(payload);
    }
    return { success: false, error: 'WhatsApp is not available' };
  }

  onQrCode(callback: (qr: string) => void): () => void {
    if (typeof window.whatsappApi?.onQrCode === 'function') {
      return window.whatsappApi.onQrCode(callback);
    }
    return () => {};
  }

  onStatusChange(callback: (status: WhatsAppStatus) => void): () => void {
    if (typeof window.whatsappApi?.onStatusChange === 'function') {
      return window.whatsappApi.onStatusChange((status) => callback(status as WhatsAppStatus));
    }
    return () => {};
  }
}

export const whatsappElectron: IWhatsApp = new WhatsAppElectronImpl();
