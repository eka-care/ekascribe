'use client';

import {
  Bold,
  Italic,
  Strikethrough,
  Underline,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Table2,
  type LucideIcon,
} from 'lucide-react';

import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';

interface EditorToolbarProps {
  onExecCommand: (command: string, payload?: Record<string, unknown>) => void;
}

type ToolbarAction = {
  label: string;
  command: string;
  payload?: Record<string, unknown>;
  icon?: LucideIcon;
  text?: string;
};

const SEPARATOR = 'separator';

const TOOLBAR: (ToolbarAction | typeof SEPARATOR)[] = [
  { label: 'Heading 1', command: 'heading', payload: { level: 1 }, text: 'H1' },
  { label: 'Heading 2', command: 'heading', payload: { level: 2 }, text: 'H2' },
  { label: 'Heading 3', command: 'heading', payload: { level: 3 }, text: 'H3' },
  SEPARATOR,
  { label: 'Bold', command: 'bold', icon: Bold },
  { label: 'Italic', command: 'italic', icon: Italic },
  { label: 'Underline', command: 'underline', icon: Underline },
  { label: 'Strikethrough', command: 'strike', icon: Strikethrough },
  SEPARATOR,
  { label: 'Bullet list', command: 'bulletList', icon: List },
  { label: 'Ordered list', command: 'orderedList', icon: ListOrdered },
  SEPARATOR,
  { label: 'Table', command: 'table', icon: Table2 },
  SEPARATOR,
  { label: 'Undo', command: 'undo', icon: Undo2 },
  { label: 'Redo', command: 'redo', icon: Redo2 },
];

const buttonClass =
  'w-7 h-7 flex items-center justify-center cursor-pointer rounded-[6px] hover:bg-[#eef1f6] text-[#1a2233] transition-colors';

const headingButtonClass =
  'h-7 px-1.5 flex items-center justify-center cursor-pointer rounded-[6px] hover:bg-[#eef1f6] text-[#1a2233] text-[13px] font-semibold transition-colors';

const EditorToolbar = ({ onExecCommand }: EditorToolbarProps) => {
  const items = TOOLBAR;
  return (
    <div className="flex items-center py-0.5 overflow-x-auto">
      <div className="flex items-center gap-0.5 w-max">
        {items.map((item, index) =>
          item === SEPARATOR ? (
            <div key={`separator-${index}`} className="w-px h-4 bg-[#eef1f6] mx-1" />
          ) : (
            <CustomTooltip key={item.label}>
              <CustomTooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={item.label}
                  className={item.text ? headingButtonClass : buttonClass}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onExecCommand(item.command, item.payload);
                  }}
                >
                  {item.icon ? <item.icon className="w-4 h-4" /> : item.text}
                </button>
              </CustomTooltipTrigger>
              <CustomTooltipContent side="bottom">{item.label}</CustomTooltipContent>
            </CustomTooltip>
          )
        )}
      </div>
    </div>
  );
};

export default EditorToolbar;
