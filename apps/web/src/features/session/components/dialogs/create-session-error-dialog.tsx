'use client';

import { TriangleAlert, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, Button } from '@ui/src';

interface CreateSessionErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  code?: string;
  onStartNewSession: () => void;
  onEditSettings?: () => void;
}

export function CreateSessionErrorDialog({
  open,
  onOpenChange,
  message,
  code,
  onStartNewSession,
  onEditSettings,
}: CreateSessionErrorDialogProps) {
  const isBadRequest = code === 'bad_request';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[360px] max-w-[360px] p-6 gap-0 rounded-lg shadow border-none"
      >
        <DialogTitle className="sr-only">Session Creation Failed</DialogTitle>

        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 cursor-pointer text-[#808080] hover:text-[#191919] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center gap-5">
          <div className="w-14 h-14 rounded-lg border border-destructive bg-[#FEE2E2] flex items-center justify-center">
            <TriangleAlert className="w-8 h-8 text-destructive" />
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              Failed to create session
            </h3>
            {isBadRequest ? (
              <p className="text-sm text-[#595959] text-balance">
                Your current configuration may be invalid. Try updating your languages or templates.{' '}
                <button
                  onClick={onEditSettings}
                  className="text-primary underline cursor-pointer"
                >
                  Edit default settings
                </button>
              </p>
            ) : (
              <p className="text-sm text-[#595959] text-balance">{message}</p>
            )}
          </div>

          <Button className="w-full rounded-lg cursor-pointer" onClick={onStartNewSession}>
            Start new session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
