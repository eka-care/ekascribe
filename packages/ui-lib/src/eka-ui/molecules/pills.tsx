import * as React from 'react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonVariant = ComponentProps<typeof Button>['variant'];
type ButtonSize = ComponentProps<typeof Button>['size'];

export type PillItem = {
  id: string;
  label: string;
  value: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  onClick?: (item: PillItem) => void;
};

export interface PillsProps {
  items: PillItem[];
  onItemClick?: (item: PillItem) => void;
  className?: string;
  pillClassName?: string;
}

export const Pills: React.FC<PillsProps> = ({ items, onItemClick, className, pillClassName }) => {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item) => (
        <Button
          key={item.id}
          type="button"
          variant={item.variant ?? 'outline'}
          size={item.size ?? 'sm'}
          className={cn('rounded-full px-3 h-8 text-xs font-medium', pillClassName, item.className)}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onClick?.(item);
            onItemClick?.(item);
          }}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
};
