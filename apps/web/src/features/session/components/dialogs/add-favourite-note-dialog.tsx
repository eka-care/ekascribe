'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@ui/src';

import FavouriteStepOne from './favourite-note-steps/step-1';
import FavouriteStepTwo from './favourite-note-steps/step-2';
import FavouriteStepThree from './favourite-note-steps/step-3';

type AddFavouriteNoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showTutorial: boolean;
  defaultName: string;
  onAdd: (name: string) => Promise<boolean>;
};

export function AddFavouriteNoteDialog({
  open,
  onOpenChange,
  showTutorial,
  defaultName,
  onAdd,
}: AddFavouriteNoteDialogProps) {
  const [step, setStep] = useState<'tutorial' | 'name'>('tutorial');
  const [name, setName] = useState(defaultName);
  const [isAdding, setIsAdding] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(showTutorial ? 'tutorial' : 'name');
      setName(defaultName);
      setIsAdding(false);
    }
    wasOpen.current = open;
  }, [open, showTutorial, defaultName]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleContinue = useCallback(() => setStep('name'), []);

  const handleAdd = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || isAdding) return;
    setIsAdding(true);
    const success = await onAdd(trimmed);
    setIsAdding(false);
    if (success) onOpenChange(false);
  }, [name, isAdding, onAdd, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        className={`w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 gap-0 rounded-xl border-none [&>button]:hidden ${
          step === 'tutorial' ? 'max-w-[54rem] sm:max-w-[54rem]' : 'max-w-[29rem] sm:max-w-[29rem]'
        }`}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {step === 'tutorial' ? 'How favourite notes work' : 'Add to favourite notes?'}
          </DialogTitle>
          <DialogDescription>
            Save this note to favourites for quick access later
          </DialogDescription>
        </DialogHeader>

        {step === 'tutorial' ? (
          <div className="px-6 pt-5 pb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-semibold text-[#1A1A1A]">
                  How favourite notes work
                </h2>
                <span className="px-2.5 py-1 rounded-full bg-[#039855] text-[10px] font-semibold tracking-wider text-white">
                  NEW FEATURE
                </span>
              </div>
              <button
                onClick={handleClose}
                className="p-1 rounded-md hover:bg-[#F5F5F5] cursor-pointer transition-colors shrink-0"
              >
                <X className="w-5 h-5 text-[#767676]" />
              </button>
            </div>
            <p className="mt-1 text-sm text-[#767676]">
              Save any note once, then reuse it as a starting point for future sessions.
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TutorialStep
                step={1}
                title="Star a note"
                description="Save any note you'd like to reuse in another session later."
              >
                <FavouriteStepOne />
              </TutorialStep>
              <TutorialStep
                step={2}
                title="Open the + menu"
                description="In the tab bar of any new session, to see your saved notes."
              >
                <FavouriteStepTwo />
              </TutorialStep>
              <TutorialStep
                step={3}
                title="Add the note, edit freely"
                description="Added as a new, pre-filled tab. Change anything you need to."
              >
                <FavouriteStepThree />
              </TutorialStep>
            </div>

            <div className="mt-6 flex justify-end">
              <Button className="cursor-pointer" onClick={handleContinue}>
                Continue to add
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-6 pt-5 pb-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold leading-7 text-[#1A1A1A]">
                  Add to favourite notes?
                </h2>
                <button
                  onClick={handleClose}
                  className="p-0.5 rounded-md hover:bg-[#F5F5F5] cursor-pointer transition-colors shrink-0"
                >
                  <X className="w-4 h-4 text-[#767676]" />
                </button>
              </div>
              <p className="text-sm leading-5 text-[#1A1A1A]">
                Give this note a name so it&apos;s easy to find in your favourites.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label
                  htmlFor="favourite-note-name"
                  className="text-xs font-medium leading-4 text-[#767676]"
                >
                  Note name
                </label>
                <Input
                  id="favourite-note-name"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="Enter a name for this note"
                  className="h-10 bg-[#F5F5F5] border border-[#D1D1D1] shadow-none focus-visible:ring-0 focus-visible:outline-none focus-visible:border-primary"
                />
              </div>
              <Button
                className="h-10 gap-1.5 cursor-pointer"
                disabled={!name.trim() || isAdding}
                onClick={handleAdd}
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                Add
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TutorialStep({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {children}
      <span className="mt-4 text-xs font-semibold tracking-widest text-primary">
        STEP {step}
      </span>
      <h3 className="mt-1 text-base font-semibold text-[#1A1A1A]">{title}</h3>
      <p className="mt-1 text-sm text-[#767676]">{description}</p>
    </div>
  );
}
