import TemplateHeader from '@/features/templates/components/template-header';
import CustomSectionSideSheet from '@/features/templates/components/custom-section/custom-section-side-sheet';
import TemplateContainer from '@/features/templates/components/template-container';
import { TEMPLATE_HEADER_CONFIG_STATE } from '@/features/templates/config/template-header-config';

const EditTemplate = () => {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#F5F8FF]">
      <TemplateHeader configKey={TEMPLATE_HEADER_CONFIG_STATE.EDIT} />

      <div className="flex-1 w-full overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-3 min-h-0">
        <div className="h-full lg:col-span-2 lg:overflow-y-auto">
          <TemplateContainer />
        </div>
        <div className="hidden lg:block lg:col-span-1 h-full overflow-y-auto">
          <CustomSectionSideSheet />
        </div>
      </div>
    </div>
  );
};

export default EditTemplate;
