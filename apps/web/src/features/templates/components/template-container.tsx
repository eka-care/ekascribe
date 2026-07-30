'use client';

import { Card, CardContent, Input, Label } from '@ui/src';
import { useMemo, useState } from 'react';
import useVoice2RxStore from '@/store/store';
import SimpleMdeReact from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import ConfirmationDialog from '@/shared-components/dialog/confirmation-dialog';

const TemplateContainer = () => {
  const templateData = useVoice2RxStore((state) => state.templateData);
  const setTemplateData = useVoice2RxStore((state) => state.setTemplateData);

  const [confirmationAlert, setConfirmationAlert] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const mdeOptions = useMemo(
    () => ({
      status: false,
      minHeight: '80px',
      maxHeight: 'calc(100vh - 22rem)',
      toolbar: [
        'bold',
        'italic',
        'heading',
        '|',
        'quote',
        'unordered-list',
        'ordered-list',
        '|',
        'preview',
        '|',
        'undo',
        'redo',
      ] as const,
      spellChecker: false,
      autofocus: false,
    }),
    []
  );

  return (
    <>
      <div className="p-3 sm:p-4 min-h-full flex flex-col">
        <Card className="border-border flex-1 flex flex-col">
          <CardContent className="px-4 sm:px-6 space-y-4 flex-1 flex flex-col overflow-hidden">
            <div className="space-y-2 w-full max-w-sm">
              <Label
                htmlFor="template-name"
                className="text-sm leading-5 font-medium text-secondary-foreground"
              >
                Template Name
              </Label>
              <Input
                id="template-name"
                placeholder="Add template name"
                className="text-foreground shadow-xs border-border rounded-md w-full"
                value={templateData?.title}
                onChange={(e) => setTemplateData({ ...templateData, title: e.target.value })}
                maxLength={100}
              />
            </div>

            {/* Content Area Based on Selection */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="space-y-2 flex-1 flex flex-col">
                <Label className="text-sm leading-5 font-medium text-secondary-foreground">
                  Template Instructions
                </Label>
                <SimpleMdeReact
                  id="template-description"
                  placeholder="Specify details about the content, structure, and rules to be applied to your notes."
                  value={templateData?.desc}
                  onChange={(value) => {
                    setTemplateData({
                      ...templateData,
                      desc: value,
                    });
                  }}
                  className="resize-none border-border break-word text-sm flex-1"
                  options={mdeOptions}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmationDialog
        title={confirmationAlert.title}
        description={confirmationAlert.description}
        open={confirmationAlert.open}
        onOpenChange={(open) => setConfirmationAlert({ ...confirmationAlert, open })}
        onConfirm={confirmationAlert.onConfirm}
        confirmText="Continue"
        cancelText="Cancel"
      />
    </>
  );
};

export default TemplateContainer;
