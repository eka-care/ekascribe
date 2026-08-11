'use client';

import { Plus, Loader2, X, Pencil } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@ui/src';
import {
  CustomTooltip,
  CustomTooltipTrigger,
  CustomTooltipContent,
} from '@/shared-components/custom-tooltip';

export type TSessionTab = {
  id: string;
  label: string;
  closable?: boolean;
  renamable?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
};

interface SessionTabRowProps {
  tabs: TSessionTab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  onAddTab?: () => void;
  showAddButton?: boolean;
  onRenameTab?: (tabId: string, newLabel: string) => void;
  onDeleteTab?: (tabId: string) => void;
  addButtonLabel?: string;
  renderAddPopoverContent?: (close: () => void) => React.ReactNode;
  disabledTabIds?: string[];
  onDisabledTabClick?: () => void;
}

const SessionTabRow = ({
  tabs,
  activeTabId,
  onTabChange,
  onAddTab,
  showAddButton = false,
  onRenameTab,
  onDeleteTab,
  addButtonLabel,
  renderAddPopoverContent,
  disabledTabIds,
  onDisabledTabClick,
}: SessionTabRowProps) => {
  const [isAddPopoverOpen, setIsAddPopoverOpen] = useState(false);
  const [isAddButtonHovered, setIsAddButtonHovered] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Focus input when editing
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (activeTabId && activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activeTabId]);

  const NON_DELETABLE_TABS = ['transcript', 'context'];

  const handleRenameSubmit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      onRenameTab?.(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, onRenameTab]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenameSubmit();
      } else if (e.key === 'Escape') {
        setEditingTabId(null);
        setEditValue('');
      }
    },
    [handleRenameSubmit]
  );


  return (
    <div className="flex items-center bg-[#F5F5F5] border-b border-[#D1D1D1] rounded-t-xl">
      <div
        className="flex items-center overflow-x-auto min-w-0 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingTabId === tab.id;
          const isLoading = tab.loading;

          const isClosable = tab.closable || !NON_DELETABLE_TABS.includes(tab.id);

          return (
            <button
              key={tab.id}
              ref={isActive ? activeTabRef : undefined}
              onClick={() => {
                if (!isEditing && !isLoading) {
                  if (disabledTabIds?.includes(tab.id)) {
                    onDisabledTabClick?.();
                    return;
                  }
                  onTabChange(tab.id);
                }
              }}
              className={`px-4 py-3 text-sm transition-colors relative whitespace-nowrap shrink-0 group ${
                isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${
                isActive
                  ? 'bg-white font-semibold text-[#191919] border-b-2 border-b-primary'
                  : 'font-normal text-[#1A1A1A] hover:text-[#191919]'
              }`}
            >
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  size={Math.max(editValue.length, 2)}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={handleRenameKeyDown}
                  className="bg-transparent border-b border-primary outline-none text-sm font-semibold text-[#191919] min-w-[2ch] max-w-[24ch]"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                  {tab.loading && <Loader2 className="w-3 h-3 animate-spin" />}
                  {isClosable && isActive && !isLoading && (
                      <>
                        {tab.renamable !== false && (
                          <CustomTooltip>
                            <CustomTooltipTrigger asChild>
                              <span
                                role="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTabId(tab.id);
                                  setEditValue(tab.label);
                                }}
                                className="p-0.5 rounded hover:bg-[#EDEDED] transition-colors"
                              >
                                <Pencil className="w-3 h-3 text-[#1A1A1A] hover:text-[#191919]" />
                              </span>
                            </CustomTooltipTrigger>
                            <CustomTooltipContent
                              side="bottom"
                              sideOffset={4}
                              className="pointer-events-auto cursor-pointer"
                              onClick={() => {
                                setEditingTabId(tab.id);
                                setEditValue(tab.label);
                              }}
                            >
                              Rename notes
                            </CustomTooltipContent>
                          </CustomTooltip>
                        )}
                        <CustomTooltip>
                          <CustomTooltipTrigger asChild>
                            <span
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTab?.(tab.id);
                              }}
                              className="p-0.5 rounded hover:bg-[#EDEDED] transition-colors"
                            >
                              <X className="w-3 h-3 text-destructive hover:text-destructive/90" />
                            </span>
                          </CustomTooltipTrigger>
                          <CustomTooltipContent
                            side="bottom"
                            sideOffset={4}
                            className="pointer-events-auto cursor-pointer"
                            onClick={() => onDeleteTab?.(tab.id)}
                          >
                            Remove notes
                          </CustomTooltipContent>
                        </CustomTooltip>
                      </>
                    )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showAddButton && (
        <Popover open={isAddPopoverOpen} onOpenChange={(open) => {
          if (open && disabledTabIds && disabledTabIds.length > 0) {
            onDisabledTabClick?.();
            return;
          }
          setIsAddPopoverOpen(open);
        }}>
          <CustomTooltip open={isAddButtonHovered && !isAddPopoverOpen}>
            <CustomTooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  onMouseEnter={() => setIsAddButtonHovered(true)}
                  onMouseLeave={() => setIsAddButtonHovered(false)}
                  className="cursor-pointer mx-1 my-1 p-2 rounded-md text-[#215FFF] hover:bg-[#EDEDED] transition-colors shrink-0 flex items-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </PopoverTrigger>
            </CustomTooltipTrigger>
            <CustomTooltipContent side="top" sideOffset={4} align="center">
              {addButtonLabel || 'Add or convert'}
            </CustomTooltipContent>
          </CustomTooltip>
          <PopoverContent
            align="start"
            sideOffset={4}
            collisionPadding={{ right: 12 }}
            className="w-auto p-0 border border-[#D1D1D1] rounded-lg shadow-lg bg-white"
          >
            {renderAddPopoverContent ? (
              renderAddPopoverContent(() => setIsAddPopoverOpen(false))
            ) : (
              <button
                onClick={() => {
                  onAddTab?.();
                  setIsAddPopoverOpen(false);
                }}
                className="text-sm text-[#1A1A1A] hover:opacity-80 cursor-pointer transition-opacity whitespace-nowrap p-4"
              >
                Add new note
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default SessionTabRow;
