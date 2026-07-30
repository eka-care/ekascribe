'use client';

import React from 'react';
import ButtonWrapper from '@/shared-components/button/button-wrapper';
import templateHeaderConfig, {
  TEMPLATE_HEADER_BUTTON_TITLE,
  TEMPLATE_HEADER_CONFIG_STATE,
} from '@/features/templates/config/template-header-config';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { useQueryClient } from '@tanstack/react-query';
import { getAllTemplatesQueryKey } from '@/features/templates/hooks/use-get-all-templates';
import useVoice2RxStore from '@/store/store';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { tracker } from '@/analytics';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { TPreferenceItem } from '@/constants/types';
import ScreenHeader, { BreadcrumbItemType } from '@/shared-components/page-header';

const TemplateHeader = ({
  configKey,
  onAiGenerate,
}: {
  configKey: TEMPLATE_HEADER_CONFIG_STATE;
  onAiGenerate?: () => void;
}) => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);

  const headerData = templateHeaderConfig[configKey];

  const userSelectedTemplatesList = useVoice2RxStore((state) => state.userSelectedTemplatesList);
  const templateData = useVoice2RxStore((state) => state.templateData);
  const setTemplateData = useVoice2RxStore((state) => state.setTemplateData);
  const templateAction = useVoice2RxStore((state) => state.templateAction);
  const setTemplateAction = useVoice2RxStore((state) => state.setTemplateAction);
  const clearWarningInfo = useVoice2RxStore((state) => state.clearWarningInfo);
  const setUserSelectedTemplatesList = useVoice2RxStore(
    (state) => state.setUserSelectedTemplatesList
  );

  const getBreadcrumbItems = (): BreadcrumbItemType[] => {
    const items: BreadcrumbItemType[] = [
      {
        label: 'Templates',
        href: '/template',
        isCurrentPage: configKey === TEMPLATE_HEADER_CONFIG_STATE.DEFAULT,
      },
    ];

    switch (configKey) {
      case TEMPLATE_HEADER_CONFIG_STATE.CREATE: {
        items.push({
          label: 'Create Template',
          href: '/template/create',
          isCurrentPage: configKey === TEMPLATE_HEADER_CONFIG_STATE.CREATE,
        });
        break;
      }
      case TEMPLATE_HEADER_CONFIG_STATE.EDIT: {
        items.push({
          label: templateData?.title || 'Edit Template',
          href: '#',
          isCurrentPage: configKey === TEMPLATE_HEADER_CONFIG_STATE.EDIT,
        });
        break;
      }
      default:
        // For template list page, don't add additional items
        items[0].isCurrentPage = configKey === TEMPLATE_HEADER_CONFIG_STATE.DEFAULT;
        break;
    }

    return items;
  };

  const handleAddTemplate = async () => {
    try {
      if (!templateData) throw new Error('Template data is not set');

      setIsLoading(true);

      // edit template
      if (templateAction === 'edit' && !templateData.default) {
        const updateTemplateResponse = await with401Retry(
          () =>
            getSDK().documents.updateTemplate({
              template_id: templateData.id,
              title: templateData.title || '',
              desc: templateData.desc,
              section_ids: [],
            }),
          'update template'
        );

        setIsLoading(false);

        const { status_code: statusCode, msg, error } = updateTemplateResponse;
        if (statusCode >= 400) {
          toast.error(error?.message || 'Something went wrong. Please try again.');
          return;
        }

        toast.success(msg || 'Template updated successfully');
        queryClient.invalidateQueries({ queryKey: getAllTemplatesQueryKey() });
        setTemplateData(null);

        router.push('/template?tab=template-directory');
      }
      // create template
      else {
        const createTemplateResponse = await with401Retry(
          () =>
            getSDK().documents.createTemplate({
              title: templateData.title || '',
              desc: templateData.desc,
              section_ids: [],
            }),
          'create template'
        );

        setIsLoading(false);

        const { status_code: statusCode, msg, error, template_id } = createTemplateResponse;
        if (statusCode >= 400) {
          toast.error(error?.message || 'Something went wrong. Please try again.');
          return;
        }

        if (template_id) {
          await handleAddNewTemplateToList({
            templateId: template_id,
            templateName: templateData.title || '',
          });
        }

        toast.success(msg || 'Template created successfully');
        queryClient.invalidateQueries({ queryKey: getAllTemplatesQueryKey() });
        setTemplateData(null);

        router.push('/template?tab=my-library');
        return;
      }
    } catch (error) {
      console.error(error, 'add/update template error');
    }
  };

  const handleAddNewTemplateToList = async ({
    templateId,
    templateName,
  }: {
    templateId: string;
    templateName: string;
  }) => {
    let requestTemplates = userSelectedTemplatesList.map((template) => template.id);
    requestTemplates.push(templateId);

    let updatedSelectedTemplatesList: TPreferenceItem[] = [];

    updatedSelectedTemplatesList = [
      { name: templateName, id: templateId },
      ...userSelectedTemplatesList,
    ];

    await with401Retry(
      () =>
        getSDK().sessions.updateConfig({
          data: {
            my_templates: requestTemplates,
          },
          request_type: 'user',
        }),
      'add new created template to list'
    );

    setUserSelectedTemplatesList(updatedSelectedTemplatesList);

    return;
  };

  const handleButtonClick = (buttonTitle: TEMPLATE_HEADER_BUTTON_TITLE) => {
    switch (buttonTitle) {
      case TEMPLATE_HEADER_BUTTON_TITLE.CREATE_TEMPLATE: {
        tracker.track({
          name: MIXPANEL_EVENT_NAME.SCRIBEWEB_TEMPLATES_CLICKS,
          type: MIXPANEL_EVENT_TYPE.CREATE_TEMPLATE,
        });
        setTemplateData(null);

        setTemplateAction('create');
        router.push('/template/create?type=raw-template');
        return;
      }
      case TEMPLATE_HEADER_BUTTON_TITLE.AI_GENERATE_TEMPLATE: {
        tracker.track({
          name: MIXPANEL_EVENT_NAME.SCRIBEWEB_TEMPLATES_CLICKS,
          type: MIXPANEL_EVENT_TYPE.GENERATE_TEMPLATE,
        });
        setTemplateData(null);

        setTemplateAction('ai');
        clearWarningInfo();
        onAiGenerate?.();
        return;
      }
      case TEMPLATE_HEADER_BUTTON_TITLE.SAVE_TEMPLATE: {
        handleAddTemplate();
        return;
      }
    }
  };

  const breadcrumbItems = getBreadcrumbItems();
  return (
    <>
      <ScreenHeader breadcrumbs={breadcrumbItems}>
        {headerData.buttons.map((button) => (
          <ButtonWrapper
            variant={button.variant}
            className="border-border rounded-lg cursor-pointer"
            key={button.title}
            onClick={() => handleButtonClick(button.title)}
            isLoading={isLoading}
          >
            <button.icon className="w-4 h-4" />
            {button.title}
          </ButtonWrapper>
        ))}
      </ScreenHeader>

    </>
  );
};

export default TemplateHeader;
