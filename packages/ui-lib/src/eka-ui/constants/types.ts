import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export interface SidebarTab {
  id: string;
  title: string;
  leftIcon: LucideIcon;
  content?: ReactNode;
  rightIcon?: LucideIcon;
}

export interface SidebarConfig {
  logo?: {
    src?: string;
    alt?: string;
    title?: string;
  };
  tabs: SidebarTab[];
  user?: {
    name: string;
    email?: string;
    avatar?: string;
  };
  onTabClick?: (tabId: string) => void;
}

export interface DualSidebarProps {
  config: SidebarConfig;
  defaultCollapsed?: boolean;
  width?: {
    main: number;
    secondary: number;
  };
  className?: string;
}
