import * as React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ChevronRight } from 'lucide-react';

export interface ListItemProps {
  avatar?: string;
  avatarFallback?: string;
  name: string;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
  showChevron?: boolean;
  disabled?: boolean;
}

export const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(
  (
    {
      avatar,
      avatarFallback,
      name,
      subtitle,
      onClick,
      className,
      showChevron = true,
      disabled = false,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100',
          disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
          className
        )}
        onClick={disabled ? undefined : onClick}
      >
        {/* Avatar */}
        <Avatar className="size-10 flex-shrink-0">
          {avatar ? (
            <AvatarImage src={avatar} alt={name} />
          ) : (
            <AvatarFallback className="bg-gray-200 text-gray-600">
              {avatarFallback || name.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">{name}</div>
          {subtitle && <div className="text-sm text-gray-500 truncate">{subtitle}</div>}
        </div>

        {/* Chevron Icon */}
        {showChevron && <ChevronRight className="size-4 text-gray-400 flex-shrink-0" />}
      </div>
    );
  }
);
