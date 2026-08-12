import { LucideIcon, Plus, Save } from 'lucide-react';

export enum TEMPLATE_HEADER_CONFIG_STATE {
  DEFAULT = 'default',
  CREATE = 'create',
  EDIT = 'edit',
}

export type TTemplateHeaderObject = {
  title: string;
  subtitle: string;
  buttons: Array<{
    icon: LucideIcon;
    title: TEMPLATE_HEADER_BUTTON_TITLE;
    variant: 'default' | 'outline' | 'destructive';
  }>;
};

export enum TEMPLATE_HEADER_BUTTON_TITLE {
  CREATE_TEMPLATE = 'Create Template',
  AI_GENERATE_TEMPLATE = 'AI Generate Template',
  SAVE_TEMPLATE = 'Save Template',
}

export type TTemplateHeaderConfig = Record<TEMPLATE_HEADER_CONFIG_STATE, TTemplateHeaderObject>;

const templateHeaderConfig: TTemplateHeaderConfig = {
  default: {
    title: 'Templates',
    subtitle: 'Templates are used to extract onformation from session in specific format',
    buttons: [
      {
        icon: Plus,
        title: TEMPLATE_HEADER_BUTTON_TITLE.CREATE_TEMPLATE,
        variant: 'default',
      },
    ],
  },
  create: {
    title: 'Templates /',
    subtitle: 'Create Template',
    buttons: [
      {
        icon: Save,
        title: TEMPLATE_HEADER_BUTTON_TITLE.SAVE_TEMPLATE,
        variant: 'default',
      },
    ],
  },
  edit: {
    title: 'Templates /',
    subtitle: '',
    buttons: [
      {
        icon: Save,
        title: TEMPLATE_HEADER_BUTTON_TITLE.SAVE_TEMPLATE,
        variant: 'default',
      },
    ],
  },
};

export default templateHeaderConfig;
