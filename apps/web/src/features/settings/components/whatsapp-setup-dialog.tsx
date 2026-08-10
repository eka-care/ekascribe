'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, CheckCircle2, ChevronDown, Info, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@ui/src';
import { useWhatsApp } from '@/platform';
import WhatsAppIcon from '@/shared-components/whatsapp-icon';

interface WhatsAppSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'instructions' | 'qr';

const WhatsAppSetupDialog = ({ open, onOpenChange }: WhatsAppSetupDialogProps) => {
  const whatsapp = useWhatsApp();
  const [step, setStep] = useState<Step>('instructions');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep('instructions');
      setQrCode(null);
      setShowSuccess(false);
      setDisclaimerOpen(false);
    }
  }, [open]);

  const startQrFlow = useCallback(() => {
    if (!whatsapp) return;
    setStep('qr');
    setQrCode(null);
  }, [whatsapp]);

  useEffect(() => {
    if (!open || step !== 'qr' || !whatsapp) return;

    const unsubQr = whatsapp.onQrCode((qr) => {
      setQrCode(qr);
    });

    const unsubStatus = whatsapp.onStatusChange((s) => {
      if (s === 'connected') {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          onOpenChange(false);
        }, 1500);
      }
    });

    whatsapp.connect();

    return () => {
      unsubQr();
      unsubStatus();
    };
  }, [open, step, whatsapp, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        {step === 'instructions' && (
          <>
            <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#DCFCE7] flex items-center justify-center shrink-0 text-[#166534]">
                  <WhatsAppIcon className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-medium leading-snug">Connect WhatsApp</DialogTitle>
                  <DialogDescription className="text-[13px] mt-0.5 text-foreground/60">
                    Send a prescription or clinical note to your patient
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 text-foreground">
              <p className="text-[13px] text-foreground/80 leading-relaxed mb-5">
                Link your WhatsApp account to Varta and send a prescription or clinical note to your patient right after consultation. Setup takes less than a minute, just scan a QR code from your phone. You can link either a personal or a WhatsApp Business account, whichever you already use.
              </p>

              <h4 className="text-[13px] font-semibold text-foreground mb-2">What you can do</h4>
              <ul className="text-[13px] text-foreground/80 leading-[1.7] mb-5 pl-[18px] list-disc">
                <li>Send a note or document the moment a session ends</li>
                <li>Reach your patient on WhatsApp from your own number, no new app for them to install</li>
                <li>No printouts, no email IDs to chase, the note arrives directly in their WhatsApp chat</li>
                <li>Get reliable delivery through WhatsApp itself, no third-party gateway in between</li>
              </ul>

              <h4 className="text-[13px] font-semibold text-foreground mb-2">How to set up</h4>
              <ol className="text-[13px] text-foreground/80 leading-[1.7] mb-5 pl-[18px] list-decimal">
                <li>Click <strong className="text-foreground font-semibold">Enable</strong> below</li>
                <li>A QR code will appear, open WhatsApp on your phone</li>
                <li>Go to <strong className="text-foreground font-semibold">Linked Devices</strong> and scan the QR code</li>
                <li>Once linked, your WhatsApp number is active for sending messages</li>
                <li>You can unlink anytime from this page or from your WhatsApp app</li>
              </ol>

              <h4 className="text-[13px] font-semibold text-foreground mb-2">Good to know</h4>
              <ul className="text-[13px] text-foreground/80 leading-[1.7] mb-5 pl-[18px] list-disc">
                <li>Works with any personal or WhatsApp Business account</li>
                <li>Sends from your own number, so the patient sees a familiar sender, you</li>
                <li>Built only for note and document delivery, nothing else</li>
                <li>Messages go out through WhatsApp directly, with the reliability you already expect</li>
                <li>Each message stays between you and your patient, never routed through or stored on our servers</li>
                <li>You can unlink anytime from Varta or from your WhatsApp app</li>
              </ul>

              <div className="border border-border rounded-lg mb-2.5">
                <div className="flex items-start gap-2 px-3 py-2.5">
                  <ShieldCheck className="w-[15px] h-[15px] text-muted-foreground mt-px shrink-0" />
                  <p className="text-[12px] text-foreground leading-relaxed">
                    Built on an open-source client library that runs on your device, this integration keeps every message between you and your patient. Nothing touches our servers, and WhatsApp&apos;s end-to-end encryption stays intact.
                  </p>
                </div>
                <div className="border-t border-border">
                  <button
                    type="button"
                    onClick={() => setDisclaimerOpen((v) => !v)}
                    className="flex items-center gap-2 w-full px-3.5 py-2.5 text-[13px] text-muted-foreground cursor-pointer bg-transparent border-none text-left"
                  >
                    <Info className="w-4 h-4 shrink-0" />
                    <span className="text-foreground">Disclaimer and terms</span>
                    <ChevronDown
                      className="w-4 h-4 ml-auto transition-transform duration-200"
                      style={{ transform: disclaimerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                  </button>
                  {disclaimerOpen && (
                    <div className="px-3.5 pb-3.5 text-[12px] text-foreground/80 leading-[1.65] space-y-2.5">
                      <p><strong className="text-foreground font-medium">How it works.</strong> This feature uses an open-source WhatsApp client library and connects through WhatsApp&apos;s official Linked Devices feature. It is not affiliated with, endorsed by, or sponsored by WhatsApp LLC or Meta Platforms, Inc. All product names and trademarks referenced belong to their respective owners.</p>
                      <p><strong className="text-foreground font-medium">Your data.</strong> Messages travel directly between your device and WhatsApp. Varta does not read, store, or process the contents of your WhatsApp messages, contacts, or chat history on its servers. WhatsApp&apos;s end-to-end encryption stays intact, and message contents remain visible only to you and the recipient.</p>
                      <p><strong className="text-foreground font-medium">Your responsibility.</strong> You are responsible for how this integration is used on your WhatsApp account, including using it only for legitimate clinical communication with patients who have agreed to receive messages from you. You are responsible for following WhatsApp&apos;s terms of service and any laws, regulations, or professional standards that apply to your practice, and for obtaining any patient consent required before sending messages.</p>
                      <p><strong className="text-foreground font-medium">Service availability.</strong> WhatsApp may restrict, limit, or suspend accounts at its discretion, including accounts that use linked-device integrations. Varta has no control over such actions and is not liable for any resulting interruptions or message delivery issues. Connection stability also depends on your device and network, which are outside Varta&apos;s control.</p>
                      <p><strong className="text-foreground font-medium">No warranty.</strong> This integration is provided on an &quot;as is&quot; and &quot;as available&quot; basis, without warranties of any kind, express or implied. Varta does not guarantee uninterrupted access, timely delivery, or compatibility with future versions of WhatsApp.</p>
                      <p><strong className="text-foreground font-medium">Changes.</strong> Varta may update, limit, or discontinue this integration at any time. Continued use after any such change constitutes acceptance of the updated terms.</p>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-foreground leading-snug">
                By clicking Enable, you agree to the applicable disclaimer and terms.
              </p>
            </div>

            <DialogFooter className="px-6 py-3.5 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Not now
              </Button>
              <Button onClick={startQrFlow}>Enable</Button>
            </DialogFooter>
          </>
        )}

        {step === 'qr' && (
          <>
            <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
              <DialogTitle>Scan QR Code</DialogTitle>
              <DialogDescription>
                Scan this QR code from your mobile WhatsApp app to connect.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-4">
              {showSuccess ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 className="size-16 text-green-500" />
                  <p className="text-sm font-medium text-foreground">Successfully connected!</p>
                </div>
              ) : qrCode ? (
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG value={qrCode} size={256} />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="size-10 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Generating QR code...</p>
                </div>
              )}
            </div>

            {!showSuccess && (
              <DialogFooter className="px-6 py-3.5 border-t border-border shrink-0">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppSetupDialog;
