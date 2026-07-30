'use client';

import { useRef } from 'react';
import { GripVertical, Minus } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useAutosizeTextarea } from '../table/cells/use-autosize-textarea';
import { CustomTooltip, CustomTooltipContent, CustomTooltipTrigger } from '@/shared-components/custom-tooltip';

interface ColumnHeaderCellProps {
  colKey: string;
  label: string;
  isCustom: boolean;
  editable: boolean;
  locked: boolean;
  isResizeActive: boolean;
  isDeleteHovered: boolean;
  isLastColumn: boolean;
  resizeHandleProps: React.HTMLAttributes<HTMLSpanElement>;
  onRename: (key: string, label: string) => void;
  onDelete: (key: string) => void;
  onDeleteHoverStart: (key: string) => void;
  onDeleteHoverEnd: () => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function ColumnHeaderCell({
  colKey,
  label,
  isCustom,
  editable,
  locked,
  isResizeActive,
  isDeleteHovered,
  isLastColumn,
  resizeHandleProps,
  onRename,
  onDelete,
  onDeleteHoverStart,
  onDeleteHoverEnd,
}: ColumnHeaderCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey,
    disabled: !editable,
  });

  // The last column's divider is the actions cell's left border, so drop this
  // one's to avoid doubling it.
  const border = isLastColumn ? '' : 'border-r border-[#E5E7EB]';

  return (
    <div
      ref={setNodeRef}
      data-col-header-cell
      data-col-key={colKey}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        `relative group/header flex items-center min-w-0 px-3 py-2.5 ${border} ` +
        (isCustom ? '' : 'text-xs font-semibold uppercase tracking-wide text-[#767676] ') +
        (isDragging ? 'opacity-70 bg-[#F3F4F6] z-30 ' : '') +
        (isDeleteHovered ? 'bg-[#FFEBED] ' : '')
      }
    >
      {editable && (
        <CustomTooltip>
          <CustomTooltipTrigger asChild>
            <span
              {...attributes}
              {...listeners}
              data-col-reorder-handle
              className={
                'flex items-center justify-center w-3 h-3 mr-1 shrink-0 cursor-grab touch-none select-none ' +
                (isDragging ? 'text-[#215FFF]' : 'text-[#767676]')
              }
            >
              <GripVertical className="w-3 h-3" />
            </span>
          </CustomTooltipTrigger>
          <CustomTooltipContent>Drag to reorder</CustomTooltipContent>
        </CustomTooltip>
      )}

      {isCustom ? (
        <CustomColumnLabelInput
          value={label}
          disabled={!editable || locked}
          onChange={(next) => onRename(colKey, next)}
        />
      ) : (
        <span className="min-w-0 break-words">{label}</span>
      )}

      {isCustom && editable && (
        <CustomTooltip>
          <CustomTooltipTrigger asChild>
            <button
              type="button"
              className={
                'absolute top-1/2 right-1 -translate-y-1/2 z-10 flex items-center justify-center w-3 h-3 rounded-full bg-white border border-[#767676] text-[#767676] hover:bg-[#FEF2F2] hover:border-[#DC2626] hover:text-[#DC2626] transition-colors cursor-pointer' +
                (locked ? ' pointer-events-none opacity-50' : '')
              }
              onMouseDown={stop}
              onMouseEnter={() => onDeleteHoverStart(colKey)}
              onMouseLeave={onDeleteHoverEnd}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(colKey);
              }}
            >
              <Minus className="w-2 h-2" />
            </button>
          </CustomTooltipTrigger>
          <CustomTooltipContent>Delete column</CustomTooltipContent>
        </CustomTooltip>
      )}

      {editable && (
        <span className="group/resize absolute right-0 top-0 bottom-0 w-2">
          <span
            aria-hidden
            className={
              'pointer-events-none absolute right-0 top-0 w-[2px] h-[3000px] group-hover/resize:bg-[#215FFF]/40 ' +
              (isResizeActive ? 'bg-[#215FFF]/40' : '')
            }
          />
          <span {...resizeHandleProps} className="absolute inset-0 cursor-col-resize select-none touch-none" />
        </span>
      )}
    </div>
  );
}

function CustomColumnLabelInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(textareaRef, value);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      className="w-full min-w-0 pr-3 resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent outline-none text-xs font-semibold uppercase tracking-wide text-[#767676] placeholder:text-[#9CA3AF] placeholder:normal-case placeholder:font-normal disabled:cursor-default"
      value={value}
      disabled={disabled}
      placeholder="Column name"
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={stop}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.preventDefault();
      }}
    />
  );
}
