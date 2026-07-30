import type { ReactNode } from 'react';
import { Mic, Pause, CircleDashed, Loader2 } from 'lucide-react';
import CheckCircleFillIcon from '@/assets/check-circle-fill-icon';
import ErrorDocumentIcon from '@/assets/error-document-icon';

export type OngoingSessionStatus = {
  label: string;
  icon: ReactNode | null;
};

export const getOngoingSessionStatus = ({
  processingStatus,
}: {
  processingStatus: string;
}): OngoingSessionStatus => {
  if (processingStatus === 'initialized') {
    return {
      label: 'Session Created',
      icon: <CircleDashed className="text-[#1A1A1A] w-4 h-4" />,
    };
  } else if (processingStatus === 'start') {
    return {
      label: 'Start New Recording',
      icon: null,
    };
  } else if (processingStatus === 'recording' || processingStatus === 'resume') {
    return {
      label: 'Recording...',
      icon: (
        <div className="rounded-full bg-destructive p-0.5 flex gap-2 animate-pulse">
          <Mic className="text-white w-2 h-2" />
        </div>
      ),
    };
  } else if (processingStatus === 'paused') {
    return {
      label: 'Paused',
      icon: (
        <div className="rounded-full bg-yellow-8 p-0.5 flex gap-2">
          <Pause className="text-white w-2 h-2" />
        </div>
      ),
    };
  } else if (processingStatus === 'analysing') {
    return {
      label: 'Analysing...',
      icon: <Loader2 className="text-muted-foreground animate-spin" size={20} />,
    };
  } else if (processingStatus === 'success') {
    return {
      label: 'Completed',
      icon: <CheckCircleFillIcon color="#039855" size={20} />,
    };
  } else if (processingStatus === 'system_failure') {
    return {
      label: 'System Failure',
      icon: <ErrorDocumentIcon size={18} />,
    };
  } else if (processingStatus === 'request_failure') {
    return {
      label: 'Request Failure',
      icon: <ErrorDocumentIcon size={18} />,
    };
  } else if (processingStatus === 'cancelled') {
    return {
      label: 'Cancelled',
      icon: <ErrorDocumentIcon size={18} />,
    };
  } else if (processingStatus === 'in-progress') {
    return {
      label: 'In Progress',
      icon: <CircleDashed className="text-[#1A1A1A] w-4 h-4" />,
    };
  }

  return {
    label: 'Start New Recording',
    icon: null,
  };
};
