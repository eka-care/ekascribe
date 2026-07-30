import useVoice2RxStore from '@/store/store';
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';
import { Info } from 'lucide-react';

const AudioQualitySummary = ({ sessionId }: { sessionId: string }) => {
  const audioMatrix = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.audio_matrix
  );

  if (!audioMatrix?.quality) return null;

  const numericQuality = parseFloat(audioMatrix.quality);
  const qualityScore = numericQuality * 10;

  if (isNaN(qualityScore) || qualityScore < 0 || qualityScore > 10) return null;

  const getQualityLabel = (score: number): string => {
    if (score >= 8) return 'Good';
    if (score >= 6) return 'Average';
    return 'Bad';
  };

  const getBgColor = (score: number): string => {
    if (score >= 8) return 'bg-green-10';
    if (score >= 6) return 'bg-yellow-11';
    return 'bg-destructive';
  };

  const getTooltipText = (score: number) => {
    if (score >= 8) {
      return {
        header:
          'Audio quality is good. Please continue using your current setup to ensure consistent, high quality output.',
        points: [],
      };
    }
    if (score >= 6) {
      return {
        header: 'Audio quality is fine but can be improved for better results:',
        points: [
          'Try speaking louder or moving closer to the microphone.',
          'Reduce background noise or echo in your surroundings.',
          'Use a good quality microphone.',
          'Try to maintain a consistent distance from the microphone.',
        ],
      };
    }
    return {
      header: 'Tips to Improve Audio Quality:',
      points: [
        'Try speaking louder or moving closer to the microphone.',
        'Reduce background noise or echo in your surroundings.',
        'Use a good quality microphone.',
        'Try to maintain a consistent distance from the microphone.',
      ],
    };
  };

  const qualityLabel = getQualityLabel(qualityScore);
  const tooltip = getTooltipText(qualityScore);

  return (
    <CustomTooltip>
      <div className="flex items-center text-xs w-fit text-secondary-foreground gap-2">
        <div className={`w-2 h-2 rounded-full ${getBgColor(qualityScore)}`} />
        <span>
          Audio Quality –{' '}
          <span className="font-semibold">
            {qualityLabel} ({qualityScore.toFixed(2)})
          </span>
        </span>
        <CustomTooltipTrigger>
          <Info className="w-3 h-3 cursor-pointer" />
        </CustomTooltipTrigger>
      </div>
      <CustomTooltipContent className="max-w-[380px]" collisionPadding={8}>
        <div className="flex flex-col space-y-2">
          <p>{tooltip.header}</p>
          {tooltip.points.length > 0 && (
            <ul className="list-disc pl-3 w-full">
              {tooltip.points.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      </CustomTooltipContent>
    </CustomTooltip>
  );
};

export default AudioQualitySummary;
