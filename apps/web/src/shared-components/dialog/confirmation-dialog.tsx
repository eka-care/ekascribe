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
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[420px] border-border mx-auto p-6 gap-4 rounded-md">
        <AlertDialogHeader className="gap-2">
          <AlertDialogTitle className={`text-lg font-semibold ${titleClassName}`}>{title}</AlertDialogTitle>
          <AlertDialogDescription className={`text-sm ${descriptionClassName}`}>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2">
          <AlertDialogCancel className="cursor-pointer min-w-20 rounded-lg text-primary! hover:text-primary!">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            className={`cursor-pointer min-w-20 rounded-lg ${
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
