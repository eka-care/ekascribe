'use client';

import TemplateHeader from '@/features/templates/components/template-header';
import TemplateCard from '@/features/templates/components/template-card';
import { TEMPLATE_HEADER_CONFIG_STATE } from '@/features/templates/config/template-header-config';
import { useGetAllTemplates } from '@/features/templates/hooks/use-get-all-templates';
import { CustomInput, Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/src';
import { useMemo, useState, useCallback } from 'react';
import { TEMPLATE_TABS } from '@/constants/enums';
import { AlertCircle, Search } from 'lucide-react';
import AlertComponent from '@/shared-components/alert/alert-component';
import TemplatesLoadingSkeleton from '@/app/template/(main)/loading';
import { useSearchParams } from 'next/navigation';
import useVoice2RxStore from '@/store/store';
import AiGenerateTemplateDialog from '@/features/templates/components/dialog/ai-generate-template-dialog';

const Templates = () => {
  const { data: allTemplates, loading: isTemplatesLoading } = useGetAllTemplates();

  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState(
    tabParam === 'template-directory' ? TEMPLATE_TABS.TEMPLATE_DIRECTORY : TEMPLATE_TABS.MY_LIBRARY
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showAiDialog, setShowAiDialog] = useState(false);

  const handleAiGenerate = useCallback(() => setShowAiDialog(true), []);
  const userSelectedTemplatesList = useVoice2RxStore((state) => state.userSelectedTemplatesList);

  const displayedTemplates = useMemo(() => {
    let templates = allTemplates;

    if (activeTab === TEMPLATE_TABS.MY_LIBRARY) {
      const selectedIds = new Set(userSelectedTemplatesList.map((t) => t.id));
      templates = allTemplates.filter((template) => template.id && selectedIds.has(template.id));
    }

    // Apply search filter by template name
    if (searchQuery.trim()) {
      templates = templates.filter((template) =>
        template.title?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return templates;
  }, [activeTab, allTemplates, searchQuery, userSelectedTemplatesList]);

  if (isTemplatesLoading) {
    return <TemplatesLoadingSkeleton />;
  }

  const renderTemplates = () => {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TEMPLATE_TABS)}
          className="w-full border-border space-y-3 sticky"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-3 sm:gap-4">
            <TabsList className="grid w-full sm:w-fit grid-cols-2 text-muted-foreground">
              <TabsTrigger
                className="text-muted-foreground data-[state=active]:text-foreground cursor-pointer text-xs sm:text-sm"
                value={TEMPLATE_TABS.MY_LIBRARY}
              >
                My Library
              </TabsTrigger>
              <TabsTrigger
                className="text-muted-foreground data-[state=active]:text-foreground cursor-pointer text-xs sm:text-sm"
                value={TEMPLATE_TABS.TEMPLATE_DIRECTORY}
              >
                Template Directory
              </TabsTrigger>
            </TabsList>
            <div className="w-full sm:w-fit">
              <CustomInput
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftComponent={<Search className="text-foreground w-4 h-4" />}
                className="border-border bg-card text-foreground pl-9 w-full sm:w-fit"
              />
            </div>
          </div>
          <TabsContent value={activeTab}>
            <div className="grid gap-3 sm:gap-4 lg:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 overflow-y-auto">
              {displayedTemplates.length > 0 ? (
                displayedTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))
              ) : (
                <div className="col-span-full">
                  <AlertComponent
                    type="warning"
                    message="No templates found"
                    Icon={() => <AlertCircle className="w-4 h-4" />}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  return (
    <div className="h-full w-full">
      <TemplateHeader
        configKey={TEMPLATE_HEADER_CONFIG_STATE.DEFAULT}
        onAiGenerate={handleAiGenerate}
      />

      {renderTemplates()}
      <AiGenerateTemplateDialog open={showAiDialog} onOpenChange={setShowAiDialog} />
    </div>
  );
};

export default Templates;
