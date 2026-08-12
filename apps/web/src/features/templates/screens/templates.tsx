'use client';

import TemplateHeader from '@/features/templates/components/template-header';
import TemplateCard from '@/features/templates/components/template-card';
import { TEMPLATE_HEADER_CONFIG_STATE } from '@/features/templates/config/template-header-config';
import { useGetAllTemplates } from '@/features/templates/hooks/use-get-all-templates';
import { CustomInput } from '@ui/src';
import { useMemo, useState } from 'react';
import { TEMPLATE_TABS } from '@/constants/enums';
import { AlertCircle, Search } from 'lucide-react';
import AlertComponent from '@/shared-components/alert/alert-component';
import TemplatesLoadingSkeleton from '@/app/template/(main)/loading';
import { useSearchParams } from 'next/navigation';
import useVoice2RxStore from '@/store/store';

const TEMPLATE_TAB_ITEMS = [
  { value: TEMPLATE_TABS.MY_LIBRARY, label: 'Active' },
  { value: TEMPLATE_TABS.TEMPLATE_DIRECTORY, label: 'All templates' },
];

const Templates = () => {
  const { data: allTemplates, loading: isTemplatesLoading } = useGetAllTemplates();

  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState(
    tabParam === 'template-directory' ? TEMPLATE_TABS.TEMPLATE_DIRECTORY : TEMPLATE_TABS.MY_LIBRARY
  );
  const [searchQuery, setSearchQuery] = useState('');

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
      <div className="p-4 sm:p-6">
        <div className="w-full space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center w-full gap-3 sm:gap-4">
            <div className="flex flex-1 items-end w-full border-b border-[#D1D1D1]">
              {TEMPLATE_TAB_ITEMS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-4 pt-2 pb-3 min-w-14 text-sm font-semibold text-center whitespace-nowrap cursor-pointer transition-colors ${
                    activeTab === tab.value
                      ? 'text-foreground border-b-2 border-primary -mb-px'
                      : 'text-muted-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="w-60 shrink-0">
              <CustomInput
                placeholder="Search templates"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftComponent={<Search className="text-muted-foreground w-4 h-4" />}
                className="h-8 rounded-lg border-border bg-white pl-8 text-xs font-medium placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 overflow-y-auto">
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
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full w-full bg-[#F5F8FF]">
      <TemplateHeader configKey={TEMPLATE_HEADER_CONFIG_STATE.DEFAULT} />

      {renderTemplates()}
    </div>
  );
};

export default Templates;
