import useVoice2RxStore from '@/store/store';
import { Dialog, DialogContent, DialogDescription, DialogOverlay, DialogTitle } from '@ui/src';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PreviewTemplateDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const templateData = useVoice2RxStore((state) => state.templateData);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="fixed inset-0 bg-alpha-black-5" />
      <DialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl border-border capitalize max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-10rem)] overflow-y-auto mx-auto">
        <DialogTitle className="font-semibold text-base sm:text-lg leading-6 sm:leading-7">
          {templateData?.title}
        </DialogTitle>
        {templateData?.desc && (
          <DialogDescription>
            <div className="text-secondary-foreground prose prose-sm max-w-none text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{templateData.desc}</ReactMarkdown>
            </div>
          </DialogDescription>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PreviewTemplateDialog;
