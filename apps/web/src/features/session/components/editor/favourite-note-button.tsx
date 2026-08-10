'use client';

import { memo, useCallback, useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';

import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/src';
import { useSavedNotes } from '../../hooks/document/use-saved-notes';
import { useFavouriteNotesOnboarding } from '../../hooks/use-favourite-notes-onboarding';
import { AddFavouriteNoteDialog } from '../dialogs/add-favourite-note-dialog';

interface FavouriteNoteButtonProps {
  documentId: string;
  documentName: string;
}

const FavouriteNoteButton = memo(function FavouriteNoteButton({
  documentId,
  documentName,
}: FavouriteNoteButtonProps) {
  const { notes, isNoteSaved, saveNote, removeNote } = useSavedNotes();
  const { showNewChip, showTutorial, markFeatureUsed, recordTutorialAttempt } =
    useFavouriteNotesOnboarding(notes.length > 0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogShowTutorial, setDialogShowTutorial] = useState(false);
  const isFavourite = isNoteSaved(documentId);

  const handleAddClick = useCallback(() => {
    setDialogShowTutorial(showTutorial);
    if (showTutorial) {
      recordTutorialAttempt();
    }
    setIsDialogOpen(true);
  }, [showTutorial, recordTutorialAttempt]);

  const handleRemove = useCallback(async () => {
    const success = await removeNote(documentId);
    if (success) {
      toast.success('Removed from favourite notes');
    } else {
      toast.error('Failed to remove from favourite notes');
    }
  }, [removeNote, documentId]);

  const handleAdd = useCallback(
    async (name: string) => {
      const success = await saveNote(documentId, name);
      if (success) {
        markFeatureUsed();
        toast.success('Added to favourite notes');
      } else {
        toast.error('Failed to add to favourite notes');
      }
      return success;
    },
    [saveNote, documentId, markFeatureUsed]
  );

  const label = isFavourite ? 'Remove from favourite notes' : 'Add to favourite notes';

  return (
    <>
      {isFavourite ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-pressed={isFavourite}
              className="relative flex items-center justify-center p-1.5 rounded-lg bg-white cursor-pointer hover:bg-[#F5F5F5] transition-colors"
            >
              <Star className="w-4 h-4 text-[#EAB308]" fill="currentColor" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={0} className="border-[#D1D1D1] p-0">
            <DropdownMenuItem
              className="cursor-pointer text-[#DC2626] focus:text-[#DC2626]"
              onSelect={handleRemove}
            >
              Remove from favourite notes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <CustomTooltip>
          <CustomTooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-pressed={isFavourite}
              onClick={handleAddClick}
              className="relative flex items-center justify-center p-1.5 rounded-lg border border-[#D1D1D1] bg-white cursor-pointer hover:bg-[#F5F5F5] transition-colors"
            >
              <Star className="w-4 h-4 text-primary" fill="none" />
              {showNewChip && (
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-[5px] py-[3px] rounded-full bg-[#039855] text-[9px] font-medium leading-none text-white pointer-events-none">
                  New
                </span>
              )}
            </button>
          </CustomTooltipTrigger>
          <CustomTooltipContent side="bottom" sideOffset={10} align="end" alignOffset={-8} collisionPadding={16}>
            {label}
          </CustomTooltipContent>
        </CustomTooltip>
      )}

      <AddFavouriteNoteDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        showTutorial={dialogShowTutorial}
        defaultName={documentName}
        onAdd={handleAdd}
      />
    </>
  );
});

export default FavouriteNoteButton;
