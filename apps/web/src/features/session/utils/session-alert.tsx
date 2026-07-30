'use client';

import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export type TSessionAlertVariant = 'default' | 'success' | 'warning' | 'destructive';

interface SessionAlertProps {
  variant?: TSessionAlertVariant;
  icon?: ReactNode;
  title: string;
  description?: string;
  listItems?: string[];
  actionComponent?: ReactNode;
  onClose?: () => void;
  autoCloseMs?: number;
  className?: string;
}

const variantStyles: Record<TSessionAlertVariant, { bg: string; border: string; text: string }> = {
  default: {
    bg: 'bg-white',
    border: 'border-[#D1D1D1]',
    text: 'text-[#1A1A1A]',
  },
  success: {
    bg: 'bg-[#ECFDF4]',
    border: 'border-[#065F46]',
    text: 'text-[#065F46]',
  },
  warning: {
    bg: 'bg-[#FFF3CD]',
    border: 'border-[#B45309]',
    text: 'text-[#B45309]',
  },
  destructive: {
    bg: 'bg-white',
    border: 'border-[#FECACA]',
    text: 'text-[#D92D20]',
  },
};

const SessionAlert = ({
  variant = 'default',
  icon,
  title,
  description,
  listItems,
  actionComponent,
  onClose,
  autoCloseMs = 2000,
  className,
}: SessionAlertProps) => {
  const styles = variantStyles[variant];

  useEffect(() => {
    if (!autoCloseMs || !onClose) return;
    const timer = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [autoCloseMs, onClose]);

  return (
    <div
      className={`flex items-start gap-2 p-3 rounded-lg border shadow-lg ${styles.bg} ${
        styles.border
      } ${className || ''}`}
    >
      {icon && <div className={`shrink-0 ${styles.text}`}>{icon}</div>}
      <div className="flex-1 flex flex-col gap-2">
        <span className={`text-sm font-medium leading-5 ${styles.text}`}>{title}</span>
        {description && (
          <span className={`text-xs font-normal leading-4 ${styles.text}`}>{description}</span>
        )}
        {listItems && listItems.length > 0 && (
          <ol className={`text-xs font-normal leading-4 ${styles.text} list-decimal pl-4`}>
            {listItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        )}
        {actionComponent}
      </div>
      {onClose && (
        <button onClick={onClose} className={`shrink-0 ${styles.text} cursor-pointer`}>
          <X className="w-4 h-4 text-foreground" />
        </button>
      )}
    </div>
  );
};

export default SessionAlert;
