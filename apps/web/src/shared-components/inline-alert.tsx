'use client';

import { X } from 'lucide-react';
import { useRef, useEffect, type ReactNode } from 'react';

interface InlineAlertProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  onClose: () => void;
}

const InlineAlert = ({ icon, title, description, onClose }: InlineAlertProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="relative w-[324px] p-4 bg-white border border-[#D1D1D1] rounded-lg flex flex-col items-center gap-2 shadow-lg"
    >
      {icon}
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-lg font-medium text-[#1A1A1A] leading-7">{title}</span>
        <span className="text-sm font-normal text-[#767676] leading-5 max-w-[245px]">
          {description}
        </span>
      </div>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <X className="w-6 h-6 text-[#767676]" />
      </button>
    </div>
  );
};

export default InlineAlert;
