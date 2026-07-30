'use client';

import { X, ArrowRight } from 'lucide-react';

interface SidebarPromoBannerProps {
  icon: React.ReactNode;
  iconContainerClassName?: string;
  title: string;
  titleClassName?: string;
  badge?: string;
  subtitle?: string;
  subtitleClassName?: string;
  progress?: number;
  bannerClassName?: string;
  onClick: () => void;
  onDismiss?: () => void;
}

export default function SidebarPromoBanner({
  icon,
  iconContainerClassName = 'bg-[#EBF0FF]',
  title,
  titleClassName = 'text-[#1A1A1A]',
  badge,
  subtitle,
  subtitleClassName = 'text-[#4B5563]',
  progress,
  bannerClassName = 'bg-white border border-[#E5E7EB]',
  onClick,
  onDismiss,
}: SidebarPromoBannerProps) {
  return (
    <div className="px-3 pb-2">
      <div className={`relative rounded-xl overflow-hidden ${bannerClassName}`}>
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-black/10 text-[#6B7280] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClick}
          className={`flex items-center gap-3 w-full px-3 py-4 text-left cursor-pointer ${onDismiss ? 'pr-8' : ''}`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconContainerClassName}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-[13px] font-semibold leading-snug ${titleClassName}`}>{title}</span>
              {badge && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white bg-[#215FFF] rounded px-1.5 py-0.5 leading-none shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {typeof progress === 'number' ? (
              <div className="mt-1.5 w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : (
              subtitle && (
                <p className={`text-[11px] leading-snug mt-0.5 ${subtitleClassName}`}>{subtitle}</p>
              )
            )}
          </div>
          <ArrowRight className="w-4 h-4 text-[#4B5563] shrink-0" />
        </button>
      </div>
    </div>
  );
}
