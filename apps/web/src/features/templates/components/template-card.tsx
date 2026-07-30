'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Switch,
} from '@ui/src';
import { Trash2, Pencil, MoveDiagonal } from 'lucide-react';
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
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import ConfirmationDialog from '@/shared-components/dialog/confirmation-dialog';

interface TemplateCardProps {
  template: TTemplateData;
}

const TemplateCard = ({ template }: TemplateCardProps) => {
  const setTemplateData = useVoice2RxStore((state) => state.setTemplateData);
  const userSelectedTemplatesList = useVoice2RxStore((state) => state.userSelectedTemplatesList);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [openPreviewDialog, setOpenPreviewDialog] = useState(false);
  const setTemplateAction = useVoice2RxStore((state) => state.setTemplateAction);
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

  const handleEdit = () => {
    if (template.default) {
      const modifiedTemplate = {
        ...template,
        title: `${template.title} - copy`,
      };
      setTemplateData(modifiedTemplate);
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
      <Card className="w-full min-h-[200px] sm:min-h-[220px] max-h-60 border-border gap-2 sm:gap-3 py-3 sm:py-4">
        <CardHeader className="flex space-x-1 px-3 sm:px-4 justify-between">
          <div className="flex flex-col min-w-0 flex-1">
            <CardTitle className="font-medium leading-6 text-sm sm:text-base truncate">
              {template.title}
            </CardTitle>

            <Badge variant="secondary" className="mt-1 text-xs w-fit">
              {template.default ? 'Default' : 'Custom'}
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="py-0.5 items-start hover:bg-transparent cursor-pointer shrink-0"
            onClick={handlePreview}
          >
            <MoveDiagonal className="w-6 h-6 sm:w-8 sm:h-8" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 overflow-hidden flex-1 px-3 sm:px-4">
          <p className="text-muted-foreground text-xs sm:text-sm leading-5 line-clamp-2">
            {template.desc}
          </p>
        </CardContent>

        <CardFooter className="px-3 sm:px-4 pt-2">
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 sm:gap-2 cursor-pointer rounded-xl text-primary text-xs sm:text-sm px-2 sm:px-3"
              onClick={handleEdit}
            >
              <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
              Edit
            </Button>

            <div className="flex space-x-1 sm:space-x-2 items-center">
              {!template.default ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="gap-2 cursor-pointer h-8 w-8 sm:h-9 sm:w-9"
                  onClick={() => setOpenDeleteDialog(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" />
                </Button>
              ) : null}

              <CustomTooltip>
                <CustomTooltipTrigger className="cursor-pointer">
                  <Switch
                    checked={isFavorite}
                    onCheckedChange={handleAddToList}
                    className="shrink-0 w-9 h-5 sm:w-11 sm:h-6 *:data-[slot=switch-thumb]:size-4 sm:*:data-[slot=switch-thumb]:size-5 *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-[calc(100%)] data-[state=unchecked]:bg-muted-foreground cursor-pointer"
                  />
                </CustomTooltipTrigger>
                <CustomTooltipContent>
                  {isFavorite ? 'Remove from my library' : 'Add to my library'}
                </CustomTooltipContent>
              </CustomTooltip>
            </div>
          </div>
        </CardFooter>
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
