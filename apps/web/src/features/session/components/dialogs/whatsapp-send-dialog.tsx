'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@ui/src';
import { toast } from 'sonner';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { buildDocumentPdfBuffer } from '@/features/session/services/document-service';
import PhoneInputField from '@/shared-components/input/phone-input';
import { useWhatsApp } from '@/platform';

interface WhatsAppSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName?: string;
  patientMobile?: string;
  doctorName?: string;
  sessionCreatedAt?: string;
  documentId: string;
  sessionId: string;
  fallbackDocumentName?: string;
}

export function formatVisitDate(isoDate: string): string {
  try {
    const asNumber = Number(isoDate);
    const date = !isNaN(asNumber) && asNumber > 0 ? new Date(asNumber * 1000) : new Date(isoDate);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export function buildCaption({
  patientName,
  doctorName,
  sessionCreatedAt,
}: {
  patientName?: string;
  doctorName?: string;
  sessionCreatedAt?: string;
}): string {
  const lines: string[] = [];

  lines.push(`Hi${patientName ? ` *${patientName}*` : ''},`);
  lines.push('');
  lines.push('Your *Prescription* is ready. Please find it attached and save it for your records.');

  if (sessionCreatedAt) {
    lines.push('');
    lines.push(`*Visit Date:* ${formatVisitDate(sessionCreatedAt)}`);
  }

  if (doctorName) {
    lines.push('');
    lines.push('Regards');
    lines.push(doctorName);
  }

  return lines.join('\n');
}

const WhatsAppSendDialog = ({
  open,
  onOpenChange,
  patientName,
  patientMobile,
  doctorName,
  sessionCreatedAt,
  documentId,
  sessionId,
  fallbackDocumentName,
}: WhatsAppSendDialogProps) => {
  const whatsapp = useWhatsApp();
  const [phoneNumber, setPhoneNumber] = useState(patientMobile || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setPhoneNumber(patientMobile || '');
      setSent(false);
    }
  }, [open, patientMobile]);

  const handleSend = useCallback(async () => {
    if (!phoneNumber.trim() || !whatsapp) return;

    setSending(true);
    try {
      const pdfResult = await buildDocumentPdfBuffer(sessionId, documentId, fallbackDocumentName);
      if (!pdfResult) {
        toast.error('Failed to generate PDF');
        return;
      }

      const caption = buildCaption({ patientName, doctorName, sessionCreatedAt });

      const result = await whatsapp.sendDocument({
        phoneNumber: phoneNumber.trim(),
        pdfBuffer: pdfResult.buffer,
        fileName: pdfResult.fileName,
        caption,
      });

      if (result.success) {
        setSent(true);
        toast.success('Prescription sent via WhatsApp');
        setTimeout(() => {
          setSent(false);
          onOpenChange(false);
        }, 1500);
      } else {
        toast.error(result.error || 'Failed to send via WhatsApp');
      }
    } catch (error) {
      console.error('WhatsApp send failed:', error);
      toast.error('Failed to generate and send prescription');
    } finally {
      setSending(false);
    }
  }, [
    phoneNumber,
    whatsapp,
    sessionId,
    documentId,
    fallbackDocumentName,
    patientName,
    doctorName,
    sessionCreatedAt,
    onOpenChange,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!sending) {
          onOpenChange(value);
          if (!value) {
            setSent(false);
            setPhoneNumber(patientMobile || '');
          }
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5" />
            Send via WhatsApp
          </DialogTitle>
          <DialogDescription>
            Send the prescription PDF to the patient&apos;s WhatsApp number.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {patientName && (
            <div className="text-sm">
              <span className="text-muted-foreground">Patient: </span>
              <span className="font-medium capitalize">{patientName}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="whatsapp-phone" className="text-sm font-medium">
              WhatsApp Number
            </label>
            <PhoneInputField
              id="whatsapp-phone"
              value={phoneNumber}
              onChange={setPhoneNumber}
              disabled={sending || sent}
            />
          </div>

          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <p className="text-foreground">
              Hi{patientName ? <> <strong className="capitalize">{patientName}</strong></> : ''},
            </p>
            <p className="text-foreground">
              Your <strong>Prescription</strong> is ready. Please find it attached and save it for your records.
            </p>
            <div className="mt-2 space-y-0.5 text-muted-foreground">
              {sessionCreatedAt && (
                <p><strong>Visit Date:</strong> {formatVisitDate(sessionCreatedAt)}</p>
              )}
              {doctorName && <p>{doctorName}</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!isValidPhoneNumber(phoneNumber) || sending || sent}>
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending...
              </>
            ) : sent ? (
              'Sent!'
            ) : (
              'Send'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppSendDialog;
