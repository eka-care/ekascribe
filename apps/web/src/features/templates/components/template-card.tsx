'use client';

import {
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
} from '@ui/src';
import { Trash2, Pencil, MoveDiagonal, EllipsisVertical } from 'lucide-react';
import { TPreferenceItem, TTemplateData } from '@/constants/types';
import useVoice2RxStore from '@/store/store';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { useQueryClient } from '@tanstack/react-query';
import { getAllTemplatesQueryKey } from '@/features/templates/hooks/use-get-all-templates';
import PreviewTemplateDialog from './dialog/preview-template-dialog';
import ConfirmationDialog from '@/shared-components/dialog/confirmation-dialog';

interface TemplateCardProps {
  template: TTemplateData;
}

const TemplateCard = ({ template }: TemplateCardProps) => {
  const setTemplateData = useVoice2RxStore((state) => state.setTemplateData);
  const userSelectedTemplatesList = useVoice2RxStore((state) => state.userSelectedTemplatesList);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const [openPreviewDialog, setOpenPreviewDialog] = useState(false);
  const setUserSelectedTemplatesList = useVoice2RxStore(
    (state) => state.setUserSelectedTemplatesList
  );
  const setUserLevelPreferences = useVoice2RxStore((state) => state.setUserLevelPreferences);
  const userLevelPreferences = useVoice2RxStore((state) => state.userLevelPreferences);

  const syncPreferencesAfterTemplateRemoval = (
    templateId: string,
    updatedSelectedTemplatesList: TPreferenceItem[]
  ) => {
    let updatedOutputFormatTemplate = userLevelPreferences.output_format_template.filter(
      (t) => t.id !== templateId
    );

    if (updatedOutputFormatTemplate.length === 0 && updatedSelectedTemplatesList.length > 0) {
      updatedOutputFormatTemplate = [updatedSelectedTemplatesList[0]];
    }

    // update preferences at user level
    setUserLevelPreferences({
      ...userLevelPreferences,
      output_format_template: updatedOutputFormatTemplate,
    });
  };

  const router = useRouter();
  const setTemplateAction = useVoice2RxStore((state) => state.setTemplateAction);

  // Default templates are edited as a copy
  const handleEdit = () => {
    if (template.default) {
      setTemplateData({ ...template, title: `${template.title} - copy` });
    } else {
      setTemplateData(template);
    }
    setTemplateAction('edit');
    router.push(`/template/edit?type=raw-template`);
  };

  const handlePreview = () => {
    setTemplateData(template);
    setOpenPreviewDialog(true);
  };

  const isFavorite = userSelectedTemplatesList.some((t) => t.id === template.id);

  const handleAddToList = async () => {
    if (!template.id) return;

    const newIsSelected = !isFavorite;

    if (!newIsSelected && userSelectedTemplatesList.length === 1) {
      toast.error(
        'At least one template must be in your library. Add another before removing this one.'
      );
      return;
    }

    const previousList = userSelectedTemplatesList;

    let updatedSelectedTemplatesList: TPreferenceItem[];

    if (newIsSelected) {
      updatedSelectedTemplatesList = [
        ...userSelectedTemplatesList,
        { name: template.title || '', id: template.id },
      ];
    } else {
      updatedSelectedTemplatesList = userSelectedTemplatesList.filter((t) => t.id !== template.id);
    }

    setUserSelectedTemplatesList(updatedSelectedTemplatesList);

    const requestTemplates = updatedSelectedTemplatesList.map((t) => t.id);

    const addTemplateToListResponse = await with401Retry(
      () =>
        getSDK().sessions.updateConfig({
          data: {
            my_templates: requestTemplates,
          },
          request_type: 'user',
        }),
      'update config'
    );

    const { status_code: statusCode, error } = addTemplateToListResponse;

    if (statusCode >= 400) {
      setUserSelectedTemplatesList(previousList);
      toast.error(error?.message || 'Something went wrong. Please try again.');
      return;
    }

    if (!newIsSelected) {
      syncPreferencesAfterTemplateRemoval(template.id, updatedSelectedTemplatesList);
    }

    toast.success(
      newIsSelected ? 'Template added to My Library' : 'Template removed from My Library.'
    );
  };

  const handleDeleteTemplate = async () => {
    if (!template.id) return;

    const deleteTemplateResponse = await with401Retry(
      () => getSDK().documents.deleteTemplate(template.id!),
      'delete template'
    );

    const { status_code: statusCode, msg, error } = deleteTemplateResponse;
    setOpenDeleteDialog(false);

    if (statusCode >= 400) {
      toast.error(error?.message || 'Something went wrong. Please try again.');
      return;
    }

    toast.success(msg || 'Template deleted successfully');

    // remove deleted template from selected templates list
    const isTemplateInList = userSelectedTemplatesList.find((t) => t.id === template.id);
    const updatedSelectedTemplatesList = userSelectedTemplatesList.filter(
      (t) => t.id !== template.id
    );

    if (isTemplateInList) {
      setUserSelectedTemplatesList(updatedSelectedTemplatesList);
    }

    // remove deleted template from user selected preferences
    syncPreferencesAfterTemplateRemoval(template.id, updatedSelectedTemplatesList);

    // refresh the cached all-templates list (drives the screen + session name map)
    queryClient.invalidateQueries({ queryKey: getAllTemplatesQueryKey() });
    return;
  };

  return (
    <>
      <Card className="w-full min-h-55 justify-between gap-2 rounded-lg border-border p-4 shadow-none">
        <div className="flex flex-col gap-2 w-full min-w-0">
          <div className="flex items-center justify-between w-full">
            <Badge
              variant="outline"
              className="rounded-full bg-white border-[#D1D1D1] px-2.5 py-0.5 text-xs font-semibold text-foreground"
            >
              {template.default ? 'Default' : 'Custom'}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg cursor-pointer"
              onClick={handlePreview}
            >
              <MoveDiagonal className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="text-md font-medium leading-7 text-foreground truncate">
              {template.title}
            </h3>
            <p className="text-muted-foreground text-xs leading-4 line-clamp-3">{template.desc}</p>
          </div>
        </div>

        <div className="flex items-center justify-between w-full border-t border-[#EDEDED] pt-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={isFavorite}
              onCheckedChange={handleAddToList}
              className="shrink-0 w-11 h-6 *:data-[slot=switch-thumb]:size-5 *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-[calc(100%)] data-[state=unchecked]:bg-muted-foreground cursor-pointer"
            />
            <span className="text-sm font-medium leading-none text-foreground">
              {isFavorite ? 'Active' : 'Inactive'}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg cursor-pointer">
                <EllipsisVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border border-border shadow-md">
              <DropdownMenuItem className="cursor-pointer" onClick={handleEdit}>
                <Pencil className="w-4 h-4" />
                Edit
              </DropdownMenuItem>
              {!template.default && (
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer"
                  onClick={() => setOpenDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <ConfirmationDialog
        title="Delete Template"
        description="Are you sure you want to delete this template?"
        variant="destructive"
        confirmText="Delete"
        open={openDeleteDialog}
        onOpenChange={setOpenDeleteDialog}
        onConfirm={handleDeleteTemplate}
      />

      <PreviewTemplateDialog open={openPreviewDialog} onOpenChange={setOpenPreviewDialog} />
    </>
  );
};

export default TemplateCard;
