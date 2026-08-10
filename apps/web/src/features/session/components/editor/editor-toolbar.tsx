'use client';

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Bold,
  ChevronDown,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@ui/src';

import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import FavouriteNoteButton from './favourite-note-button';

type ExecCommand = (command: string, payload?: Record<string, unknown>) => void;

interface EditorToolbarProps {
  onExecCommand: ExecCommand;
  activeHeadingLevel: 1 | 2 | 3 | null;
  showLabResultTable?: boolean;
  showLabInvestigationTable?: boolean;
  showMedicationTable?: boolean;
  /** When provided, shows the "Add to favourite notes" button on the right end. */
  favouriteNote?: { documentId: string; documentName: string };
}

type ToolbarAction = {
  label: string;
  command: string;
  icon: LucideIcon;
};

type TableAction = ToolbarAction & {
  requires?: 'labResult' | 'labInvestigation' | 'medication';
};

const MARK_ACTIONS: ToolbarAction[] = [
  { label: 'Bold', command: 'bold', icon: Bold },
  { label: 'Italic', command: 'italic', icon: Italic },
  { label: 'Underline', command: 'underline', icon: Underline },
  { label: 'Strikethrough', command: 'strike', icon: Strikethrough },
];

const LIST_ACTIONS: ToolbarAction[] = [
  { label: 'Bullet list', command: 'bulletList', icon: List },
  { label: 'Ordered list', command: 'orderedList', icon: ListOrdered },
];

const HISTORY_ACTIONS: ToolbarAction[] = [
  { label: 'Undo', command: 'undo', icon: Undo2 },
  { label: 'Redo', command: 'redo', icon: Redo2 },
];

const QUOTE_ACTION: ToolbarAction = { label: 'Quote', command: 'blockquote', icon: Quote };

export const HEADING_LEVELS = [1, 2, 3] as const;

const TABLE_ACTIONS: TableAction[] = [{ label: 'Table', command: 'table', icon: Table2 }];

const toggleClass =
  'size-10 shrink-0 flex items-center justify-center cursor-pointer rounded-lg text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors';

function ToolbarSeparator() {
  return (
    <div className="w-4 h-10 shrink-0 flex items-center justify-center">
      <div className="w-px h-4 bg-[#E6E6E6]" />
    </div>
  );
}

function ToolbarButton({
  action,
  onExecCommand,
}: {
  action: ToolbarAction;
  onExecCommand: ExecCommand;
}) {
  return (
    <CustomTooltip>
      <CustomTooltipTrigger asChild>
        <button
          type="button"
          aria-label={action.label}
          className={toggleClass}
          onMouseDown={(e) => {
            e.preventDefault();
            onExecCommand(action.command);
          }}
        >
          <action.icon className="w-4 h-4" />
        </button>
      </CustomTooltipTrigger>
      <CustomTooltipContent side="bottom">{action.label}</CustomTooltipContent>
    </CustomTooltip>
  );
}

const HOVER_CLOSE_DELAY_MS = 150;

function useHoverDropdown() {
  const [open, setOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
  }, []);

  const onMouseEnter = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const onMouseLeave = useCallback(() => {
    cancelClose();
    closeTimeout.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  return { open, setOpen, onMouseEnter, onMouseLeave };
}

function HeadingDropdown({
  onExecCommand,
  activeHeadingLevel,
}: {
  onExecCommand: ExecCommand;
  activeHeadingLevel: 1 | 2 | 3 | null;
}) {
  const { open, setOpen, onMouseEnter, onMouseLeave } = useHoverDropdown();
  const isActive = activeHeadingLevel !== null;

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onExecCommand('focus');
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Heading styles"
          aria-pressed={isActive}
          className="h-10 w-32 shrink-0 flex items-center justify-center gap-1 px-3 rounded-xl cursor-pointer text-xs font-medium leading-4 text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <span className="truncate">
            {isActive ? `Heading ${activeHeadingLevel}` : 'Normal text'}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-40 border-[#D1D1D1]"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <DropdownMenuItem className="cursor-pointer" onSelect={() => onExecCommand('paragraph')}>
          Normal text
        </DropdownMenuItem>
        {HEADING_LEVELS.map((level) => (
          <DropdownMenuItem
            key={level}
            className="cursor-pointer"
            onSelect={() => onExecCommand('heading', { level })}
          >
            Heading {level}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableDropdown({
  actions,
  onExecCommand,
}: {
  actions: TableAction[];
  onExecCommand: ExecCommand;
}) {
  const { open, setOpen, onMouseEnter, onMouseLeave } = useHoverDropdown();

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onExecCommand('focus');
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Table styles"
          className={toggleClass}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <Table2 className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-48 border-[#D1D1D1]"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.command}
            className="cursor-pointer"
            onSelect={() => onExecCommand(action.command)}
          >
            <action.icon className="text-primary" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const EditorToolbar = memo(function EditorToolbar({
  onExecCommand,
  activeHeadingLevel,
  showLabResultTable = false,
  showLabInvestigationTable = false,
  showMedicationTable = false,
  favouriteNote,
}: EditorToolbarProps) {
  const tableActions = useMemo(
    () =>
      TABLE_ACTIONS.filter((action) => {
        if (action.requires === 'labResult') return showLabResultTable;
        if (action.requires === 'labInvestigation') return showLabInvestigationTable;
        if (action.requires === 'medication') return showMedicationTable;
        return true;
      }),
    [showLabResultTable, showLabInvestigationTable, showMedicationTable]
  );

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-center min-w-0 overflow-x-auto">
        <div className="flex items-center w-max">
          {MARK_ACTIONS.map((action) => (
            <ToolbarButton key={action.command} action={action} onExecCommand={onExecCommand} />
          ))}
          <ToolbarSeparator />
          <HeadingDropdown onExecCommand={onExecCommand} activeHeadingLevel={activeHeadingLevel} />
          <ToolbarSeparator />
          {LIST_ACTIONS.map((action) => (
            <ToolbarButton key={action.command} action={action} onExecCommand={onExecCommand} />
          ))}
          <ToolbarSeparator />
          <ToolbarButton action={QUOTE_ACTION} onExecCommand={onExecCommand} />
          {tableActions.length > 1 ? (
            <TableDropdown actions={tableActions} onExecCommand={onExecCommand} />
          ) : (
            <ToolbarButton action={tableActions[0]} onExecCommand={onExecCommand} />
          )}
          <ToolbarSeparator />
          {HISTORY_ACTIONS.map((action) => (
            <ToolbarButton key={action.command} action={action} onExecCommand={onExecCommand} />
          ))}
        </div>
      </div>

      {favouriteNote && (
        <FavouriteNoteButton
          documentId={favouriteNote.documentId}
          documentName={favouriteNote.documentName}
        />
      )}
    </div>
  );
});

export default EditorToolbar;
