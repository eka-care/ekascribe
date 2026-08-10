import { type ReactNode } from 'react';
import {
  Copy,
  Play,
  Printer,
  RotateCcwIcon,
  Square,
  Trash2,
} from 'lucide-react';
import WhatsAppIcon from '@/shared-components/whatsapp-icon';

// --- Types ---

export type FooterButton = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'destructive';
  disabled?: boolean;
  className?: string;
  isCopyAction?: boolean;
  disabledTooltip?: string;
  /** Hover tooltip shown while the button is enabled */
  tooltip?: string;
  buttonStyle?: 'action' | 'link';
};

export type SaveStatusState = 'idle' | 'typing' | 'synced' | 'error' | 'generating';

export type TabFooterConfig = {
  saveStatus?: SaveStatusState;
  buttons: FooterButton[];
  overlay?: ReactNode;
  saveNote?: {
    onSaveNote: () => void;
    isNoteSaved?: boolean;
  };
};

// --- Config builders ---

export function getDocumentFooterConfig({
  onCopy,
  onPrint,
  onSendWhatsApp,
  onSaveNote,
  saveStatus,
  copyDisabled,
  printDisabled,
  whatsappDisabled,
  whatsappTooltip,
  whatsappDisabledTooltip,
  isNoteSaved,
}: {
  onCopy: () => void;
  onPrint: () => void;
  /** When provided (WhatsApp capability active), adds a "Send via WhatsApp" button. */
  onSendWhatsApp?: () => void;
  /** When provided, adds a "Save note" button at the end of the toolbar. */
  onSaveNote?: () => void;
  saveStatus: SaveStatusState;
  copyDisabled?: boolean;
  printDisabled?: boolean;
  whatsappDisabled?: boolean;
  whatsappTooltip?: string;
  whatsappDisabledTooltip?: string;
  isNoteSaved?: boolean;
}): TabFooterConfig {
  return {
    saveStatus,
    buttons: [
      {
        key: 'copy',
        label: 'Copy all',
        icon: <Copy className="w-4 h-4" />,
        onClick: onCopy,
        isCopyAction: true,
        disabled: copyDisabled,
        className: 'text-primary bg-white border border-[#D1D1D1] hover:bg-[#F5F5F5]',
      },
      {
        key: 'print',
        label: 'Print',
        icon: <Printer className="w-4 h-4" />,
        onClick: onPrint,
        disabled: printDisabled,
        className: 'text-primary bg-white border border-[#D1D1D1] hover:bg-[#F5F5F5]',
      },
      ...(onSendWhatsApp
        ? [
            {
              key: 'whatsapp',
              label: 'WhatsApp',
              icon: <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />,
              onClick: onSendWhatsApp,
              disabled: whatsappDisabled,
              tooltip: whatsappTooltip,
              disabledTooltip: whatsappDisabledTooltip,
              className: 'text-primary bg-white border border-[#D1D1D1] hover:bg-[#F5F5F5]',
            } as FooterButton,
          ]
        : []),
    ],
    saveNote: onSaveNote ? { onSaveNote, isNoteSaved } : undefined,
  };
}

export function getTranscriptFooterConfig({
  onCopy,
  copyDisabled,
}: {
  onCopy: () => void;
  copyDisabled?: boolean;
}): TabFooterConfig {
  return {
    buttons: [
      {
        key: 'copy',
        label: 'Copy all',
        icon: <Copy className="w-4 h-4" />,
        onClick: onCopy,
        isCopyAction: true,
        disabled: copyDisabled,
        className: 'text-primary bg-white border border-[#D1D1D1] hover:bg-[#F5F5F5]',
      },
    ],
  };
}

export function getErrorFooterConfig({
  onTryAgain,
  onDiscard,
}: {
  onTryAgain: () => void;
  onDiscard: () => void;
}): TabFooterConfig {
  return {
    buttons: [
      {
        key: 'try_again',
        label: 'Try Again',
        icon: <RotateCcwIcon className="w-4 h-4" />,
        onClick: onTryAgain,
        variant: 'default',
      },
      {
        key: 'discard_session',
        label: 'Discard Session',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: onDiscard,
        variant: 'outline',
        className: 'text-destructive border-destructive hover:bg-destructive/10',
      },
    ],
  };
}

export function getChunkLimitFooterConfig({
  onEndRecording,
  onContinueRecording,
  onDiscard,
}: {
  onEndRecording: () => void;
  onContinueRecording: () => void;
  onDiscard: () => void;
}): TabFooterConfig {
  return {
    buttons: [
      {
        key: 'end_recording',
        label: 'End Recording',
        icon: <Square className="w-4 h-4" />,
        onClick: onEndRecording,
        variant: 'default',
      },
      {
        key: 'continue_recording',
        label: 'Continue Recording',
        icon: <Play className="w-4 h-4" />,
        onClick: onContinueRecording,
        variant: 'outline',
      },
      {
        key: 'discard_session',
        label: 'Discard Session',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: onDiscard,
        variant: 'outline',
        className: 'text-destructive border-destructive hover:bg-destructive/10',
      },
    ],
  };
}
