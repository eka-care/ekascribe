import { useState, useEffect } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import ButtonWrapper from '@/shared-components/button/button-wrapper';
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import { getBlobStore } from '@/platform';

interface DownloadAudioButtonProps {
  sessionID: string;
}

const DownloadAudioButton = ({ sessionID }: DownloadAudioButtonProps) => {
  const [isDownloadAudioButtonLoading, setIsDownloadAudioButtonLoading] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkAudioAvailability = async () => {
      try {
        const exists = await getBlobStore().has(sessionID);
        if (isMounted) {
          setHasAudio(exists);
        }
      } catch (error) {
        console.error('Failed to check audio availability', error);
        if (isMounted) {
          setHasAudio(false);
        }
      }
    };

    if (sessionID) {
      checkAudioAvailability();
    }

    return () => {
      isMounted = false;
    };
  }, [sessionID]);

  const handleDownloadAudio = async () => {
    setIsDownloadAudioButtonLoading(true);

    try {
      const combinedBlob = await getBlobStore().get(sessionID, '');

      if (!combinedBlob) {
        console.warn('No audio chunks found');
        return;
      }

      const url = URL.createObjectURL(combinedBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `session-${sessionID}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('failed to get audio', error);
    } finally {
      setIsDownloadAudioButtonLoading(false);
    }
  };

  const isDisabled = isDownloadAudioButtonLoading || !hasAudio;

  if (isDisabled) return null;

  return (
    <CustomTooltip>
      <CustomTooltipTrigger asChild>
        <span
          className={`${isDisabled ? 'cursor-not-allowed' : ''} inline-flex`}
          tabIndex={isDisabled ? 0 : -1}
        >
          <ButtonWrapper
            variant="outline"
            className="gap-2 px-3 border-border cursor-pointer"
            onClick={handleDownloadAudio}
            disabled={isDisabled}
            isLoading={isDownloadAudioButtonLoading}
          >
            <ArrowDownToLine className="size-4" />
          </ButtonWrapper>
        </span>
      </CustomTooltipTrigger>
      <CustomTooltipContent collisionPadding={8} className="w-4/5 sm:w-auto text-wrap">
        Audio download is available only for the most recently recorded session.
      </CustomTooltipContent>
    </CustomTooltip>
  );
};

export default DownloadAudioButton;
