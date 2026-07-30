import { TIconProps } from '../types';

const DocAssistIcon = ({ className = '', size = 16 }: TIconProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="9.5" cy="9.5" r="6.5" fill="#215FFF" />
      <foreignObject x="-2.53846" y="-2.53846" width="14.0769" height="14.0769">
        <div
          style={{
            backdropFilter: 'blur(1.27px)',
            clipPath: 'url(#bgblur_0_427_705_clip_path)',
            height: '100%',
            width: '100%',
          }}
        ></div>
      </foreignObject>
      <circle
        data-figma-bg-blur-radius="2.53846"
        cx="4.5"
        cy="4.5"
        r="4.5"
        fill="#B45EDC"
        fillOpacity="0.6"
      />
      <defs>
        <clipPath id="bgblur_0_427_705_clip_path" transform="translate(2.53846 2.53846)">
          <circle cx="4.5" cy="4.5" r="4.5" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default DocAssistIcon;
