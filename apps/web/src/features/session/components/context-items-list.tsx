'use client';

import { Layers, Paperclip, X } from 'lucide-react';
import { TPastSessionHistoryData } from '@/constants/types';
import { CustomTooltip, CustomTooltipContent, CustomTooltipTrigger } from '@/shared-components/custom-tooltip';
import { formatContextDate } from '@/utils/shared-helpers';
import { TAttachedDocument } from '@/features/session/components/dialogs/add-attachments-dialog';

interface ContextItemsListProps {
  linkedSessions: TPastSessionHistoryData[];
  attachedDocument: TAttachedDocument | null;
  onRemoveLinkedSession: (txnId: string) => void;
  onRemoveAttachment: () => void;
}

const ContextItemsList = ({
  linkedSessions,
  attachedDocument,
  onRemoveLinkedSession,
  onRemoveAttachment,
}: ContextItemsListProps) => {
  if (linkedSessions.length === 0 && !attachedDocument) return null;

  return (
    <div className="flex flex-wrap gap-3 px-4 pb-4 mt-auto">
      {linkedSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 opacity-50 shrink-0">
            <div className="w-5 h-5 rounded-full bg-[#039855] flex items-center justify-center shrink-0">
              <Layers className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium text-[#1A1A1A]">
              Context added: {linkedSessions.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {linkedSessions.map((session) => (
              <div
                key={session.txn_id}
                className="w-45 flex items-center justify-between px-2 py-1 bg-[#EDEDED] rounded-lg"
              >
                <span className="text-sm text-[#1A1A1A] truncate">
                  {formatContextDate(session.created_at)}
                </span>
                <CustomTooltip>
                  <CustomTooltipTrigger asChild>
                    <button
                      onClick={() => onRemoveLinkedSession(session.txn_id)}
                      className="cursor-pointer transition-colors group"
                    >
                      <X className="w-4 h-4 text-[#767676] group-hover:text-[#D92D20]" />
                    </button>
                  </CustomTooltipTrigger>
                  <CustomTooltipContent
                    side="right"
                    sideOffset={4}
                    className="text-[#D92D20] text-sm font-medium cursor-pointer"
                    onClick={() => onRemoveLinkedSession(session.txn_id)}
                  >
                    Remove context
                  </CustomTooltipContent>
                </CustomTooltip>
              </div>
            ))}
          </div>
        </div>
      )}
      {attachedDocument && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 opacity-50 shrink-0">
            <div className="w-5 h-5 rounded-full bg-[#039855] flex items-center justify-center shrink-0">
              <Paperclip className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium text-[#1A1A1A]">Files attached: 1</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="w-45 flex items-center justify-between px-2 py-1 bg-[#EDEDED] rounded-lg">
              <span className="text-sm text-[#1A1A1A] truncate">{attachedDocument.name}</span>
              <CustomTooltip>
                <CustomTooltipTrigger asChild>
                  <button
                    onClick={onRemoveAttachment}
                    className="cursor-pointer transition-colors group"
                     >
                    <X className="w-4 h-4 text-[#767676] group-hover:text-[#D92D20]" />
              </button>
                </CustomTooltipTrigger>
                <CustomTooltipContent
                  side="right"
                  sideOffset={4}
                  className="text-[#D92D20] text-sm font-medium cursor-pointer"
                  onClick={onRemoveAttachment}
                >
                  Remove attachment
                </CustomTooltipContent>
              </CustomTooltip>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContextItemsList;
