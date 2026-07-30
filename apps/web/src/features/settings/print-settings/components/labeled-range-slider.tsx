'use client';

type LabeledRangeSliderProps = {
  label: string;
  sublabel?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
};

const LabeledRangeSlider = ({
  label,
  sublabel,
  value,
  min,
  max,
  step = 0.1,
  unit = 'cm',
  onChange,
}: LabeledRangeSliderProps) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium leading-5">{label}</p>
          {sublabel && <p className="text-xs text-[#767676]">{sublabel}</p>}
        </div>
        <span className="text-sm font-medium text-primary bg-primary/10 rounded-md px-2 py-0.5">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-primary/10 rounded-full appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-xs text-[#767676]">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
};

export default LabeledRangeSlider;
