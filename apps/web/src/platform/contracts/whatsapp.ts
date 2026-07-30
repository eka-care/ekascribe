/**
 * WhatsApp linked-device messaging. Desktop-only: the electron host drives a WhatsApp Web
 * client and exposes it via `window.whatsappApi`. There is no web implementation, so the
 * capability (and its `whatsapp-linked-device` descriptor) is simply absent on web and any
 * gated UI hides.
 */

export type WhatsAppStatus = 'disconnected' | 'connecting' | 'connected';

export interface WhatsAppStatusInfo {
  status: WhatsAppStatus;
  /** Linked device's phone number; present only when `status === 'connected'`. */
  phoneNumber?: string;
}

export interface SendWhatsAppDocumentPayload {
  phoneNumber: string;
  pdfBuffer: ArrayBuffer;
  fileName: string;
  caption?: string;
}

export interface SendWhatsAppDocumentResult {
  success: boolean;
  error?: string;
}

export interface IWhatsApp {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<WhatsAppStatusInfo>;
  sendDocument(payload: SendWhatsAppDocumentPayload): Promise<SendWhatsAppDocumentResult>;
  /** Subscribe to QR-code updates during linking. Returns an unsubscribe fn. */
  onQrCode(callback: (qr: string) => void): () => void;
  /** Subscribe to connection-status changes. Returns an unsubscribe fn. */
  onStatusChange(callback: (status: WhatsAppStatus) => void): () => void;
}
