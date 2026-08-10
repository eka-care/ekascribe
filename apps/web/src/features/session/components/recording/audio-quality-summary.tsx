import useVoice2RxStore from '@/store/store';
import {
  CustomTooltip,
  CustomTooltipContent,
  CustomTooltipTrigger,
} from '@/shared-components/custom-tooltip';

const AudioQualitySummary = ({ sessionId }: { sessionId: string }) => {
  const audioMatrix = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.audio_matrix
  );

  if (!audioMatrix?.quality) return null;

  const numericQuality = parseFloat(audioMatrix.quality);
  const qualityScore = numericQuality * 10;

  if (isNaN(qualityScore) || qualityScore < 0 || qualityScore > 10) return null;

  const getQualityConfig = (score: number) => {
    if (score >= 8)
      return {
        label: 'Good audio quality',
        dotColor: 'bg-[#008055]',
        badgeBg: 'bg-[#ECFCF4]',
        textColor: 'text-[#008055]',
        tooltip: {
          header:
            'Audio quality is good. Please continue using your current setup to ensure consistent, high quality output.',
          points: [],
        },
      };
    if (score >= 6)
      return {
        label: 'Average audio quality',
        dotColor: 'bg-[#E26506]',
        badgeBg: 'bg-[#FFFAEB]',
        textColor: 'text-[#E26506]',
        tooltip: {
          header: 'Audio quality is fine but can be improved for better results:',
          points: [
            'Try speaking louder or moving closer to the microphone.',
            'Reduce background noise or echo in your surroundings.',
            'Use a good quality microphone.',
            'Try to maintain a consistent distance from the microphone.',
          ],
        },
      };
    return {
      label: 'Poor audio quality',
      dotColor: 'bg-[#B71C1C]',
      badgeBg: 'bg-[#FFEBED]',
      textColor: 'text-[#B71C1C]',
      tooltip: {
        header: 'Tips to Improve Audio Quality:',
        points: [
          'Try speaking louder or moving closer to the microphone.',
          'Reduce background noise or echo in your surroundings.',
          'Use a good quality microphone.',
          'Try to maintain a consistent distance from the microphone.',
        ],
      },
    };
  };

  const config = getQualityConfig(qualityScore);

  return (
    <CustomTooltip>
      <CustomTooltipTrigger asChild>
        <div className={`flex items-center gap-1 h-7 p-2 rounded-lg border border-[#D1D1D1] ${config.badgeBg} text-xs font-medium ${config.textColor} w-fit cursor-default`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotColor}`} />
          <span>{config.label}</span>
        </div>
      </CustomTooltipTrigger>
      <CustomTooltipContent className="max-w-[380px]" collisionPadding={8}>
        <div className="flex flex-col space-y-2">
          <p>{config.tooltip.header}</p>
          {config.tooltip.points.length > 0 && (
            <ul className="list-disc pl-3 w-full">
              {config.tooltip.points.map((point, index) => (
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
