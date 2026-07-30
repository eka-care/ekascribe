import { TOutputSummaryTemplateMessage } from '@/constants/types';
import { TriangleAlert, CircleDashed, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SessionV2Error } from '../../types';

interface ErrorComponentProps {
  errors?: TOutputSummaryTemplateMessage[];
  templateName?: string;
  title: string;
  variant?: 'error' | 'warning' | 'in-progress' | 'loading';
  description?: string;
  icon?: ReactNode;
}

const DEFAULT_DESCRIPTION =
  "Please try changing template, and if it persists, contact support. We're here to help promptly.";

const ErrorComponent = ({
  errors = [],
  title,
  variant,
  description,
  icon,
}: ErrorComponentProps) => {
  const resolvedVariant = variant ?? (errors[0]?.type === 'error' ? 'error' : 'warning');
  const resolvedDescription = description || errors[0]?.msg || DEFAULT_DESCRIPTION;

  const iconConfig = {
    error: {
      bg: 'bg-[#FEE2E2] border-destructive',
      icon: <TriangleAlert className="w-10 h-10 text-destructive" />,
    },
    warning: {
      bg: 'bg-[#FFF3CD] border-[#B45309]',
      icon: <TriangleAlert className="w-10 h-10 text-[#B45309]" />,
    },
    'in-progress': {
      bg: 'bg-[#F5F5F5] border-[#D1D1D1]',
      icon: <CircleDashed className="w-10 h-10 text-secondary-foreground" />,
    },
    loading: {
      bg: 'bg-[#eff6ff] border-[#d6e4ff]',
      icon: <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />,
    },
  };

  const { bg, icon: defaultIcon } = iconConfig[resolvedVariant];
  const displayIcon = icon ?? defaultIcon;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <div className="flex flex-col items-center gap-5">
        <div className={`w-16 h-16 rounded-lg border flex items-center justify-center ${bg}`}>
          {displayIcon}
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-2xl font-semibold tracking-tight text-foreground max-w-md">
            {title}
          </h3>
          <p className="text-sm text-[#595959] max-w-sm text-balance">{resolvedDescription}</p>
        </div>
      </div>
    </div>
  );
};

// Maps a session-level error (end-recording / processing failure) to display copy.
export function getSessionErrorContent(error: SessionV2Error | null, documentName?: string) {
  if (error?.code === 'upload_failed') {
    return {
      title: 'Recording upload failed',
      description:
        error.message || 'An error occurred while uploading your recording. Please try again.',
    };
  }

  if (error?.code === 'chunk_limit_reached') {
    return {
      title: 'Session limit reached',
      description:
        error.message || 'Please end recording or continue if you want to record more.',
    };
  }

  return {
    title: `Error Generating ${documentName || 'Notes'}`,
    description:
      error?.message || 'An error occurred while processing your recording. Please try again.',
  };
}

export default ErrorComponent;
