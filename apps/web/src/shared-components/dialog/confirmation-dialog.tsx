import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/src';

interface ConfirmationAlertProps {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  titleClassName?: string;
  descriptionClassName?: string;
}

const ConfirmationDialog = ({
  title,
  description,
  open,
  onOpenChange,
  onConfirm,
  confirmText = 'Continue',
  cancelText = 'Cancel',
  variant = 'default',
  titleClassName = '',
  descriptionClassName = '',
}: ConfirmationAlertProps) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[420px] border-border mx-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className={`text-base sm:text-lg ${titleClassName}`}>{title}</AlertDialogTitle>
          <AlertDialogDescription className={`text-sm ${descriptionClassName}`}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-0 sm:gap-2">
          <AlertDialogCancel className="cursor-pointer w-full sm:w-auto">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            className={`cursor-pointer w-full sm:w-auto ${
              variant === 'destructive' ? 'bg-destructive text-white hover:bg-destructive/90' : ''
            }`}
            onClick={handleConfirm}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationDialog;
