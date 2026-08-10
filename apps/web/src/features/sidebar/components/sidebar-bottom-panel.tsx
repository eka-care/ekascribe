import { type ReactNode } from 'react';
import { X } from 'lucide-react';

type SidebarBottomPanelProps = {
  header: ReactNode;
  onClose: () => void;
  children: ReactNode;
  isCollapsed?: boolean;
};

const SidebarBottomPanel = ({ header, onClose, children, isCollapsed }: SidebarBottomPanelProps) => {
  return (
    <div className={isCollapsed
      ? "absolute left-full bottom-2 ml-2 w-56 z-50 bg-white rounded-xl shadow-lg border border-border p-3 pb-1"
      : "absolute bottom-full left-0 right-0 z-50 bg-white rounded-t-xl shadow-[0_-4px_12px_rgba(0,0,0,0.08)] border-t border-border p-3 pb-1"
    }>
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">{header}</div>
        <button
          className="shrink-0 p-1 rounded hover:bg-[#F3F4F6] cursor-pointer"
          onClick={onClose}
        >
          <X className="size-4 text-[#6B7280]" />
        </button>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
};

type SidebarPanelItemProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  trailing?: ReactNode;
};

const SidebarPanelItem = ({
  icon,
  label,
  onClick,
  variant = 'default',
  trailing,
}: SidebarPanelItemProps) => {
  return (
    <button
      className={`flex items-center gap-3 px-1 py-2 rounded-md hover:bg-[#F3F4F6] cursor-pointer text-left text-sm ${
        variant === 'destructive' ? 'text-destructive' : 'text-[#1A1A1A]'
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
      {trailing}
    </button>
  );
};

export { SidebarBottomPanel, SidebarPanelItem };
