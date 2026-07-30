import * as React from 'react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loader } from 'lucide-react';

export interface CustomButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  children?: React.ReactNode;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  prefixImage?: string;
  suffixImage?: string;
  imageAlt?: string;
  iconOnly?: boolean;
  iconSize?: 'sm' | 'md' | 'lg';
  iconClassName?: string;
  imageClassName?: string;
  gap?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'social';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
  socialProvider?: string;
  socialLogo?: React.ReactNode;
  socialText?: string;
  socialClassName?: string;
  isLoading?: boolean;
}

export const CustomButton = React.forwardRef<HTMLButtonElement, CustomButtonProps>(
  (
    {
      className,
      children,
      prefixIcon,
      suffixIcon,
      prefixImage,
      suffixImage,
      imageAlt = 'Button image',
      iconOnly = false,
      iconSize = 'md',
      iconClassName,
      imageClassName,
      gap = 'md',
      variant = 'default',
      size = 'default',
      socialProvider,
      socialLogo,
      socialText,
      socialClassName,
      isLoading = false,
      ...props
    },
    ref
  ) => {
    // Icon size mapping
    const iconSizeClasses: Record<string, string> = {
      sm: 'size-3',
      md: 'size-4',
      lg: 'size-5',
    };

    // Image size mapping (same as icons for consistency)
    const imageSizeClasses: Record<string, string> = {
      sm: 'size-3',
      md: 'size-4',
      lg: 'size-5',
    };

    // Gap size mapping
    const gapClasses: Record<string, string> = {
      none: 'gap-0',
      sm: 'gap-1',
      md: 'gap-2',
      lg: 'gap-3',
    };

    // If it's a social button, use the provided social configuration
    if (socialProvider) {
      const logo = socialLogo;
      const text = socialText || children;
      const buttonClassName = socialClassName;

      return (
        <Button
          ref={ref}
          className={cn(
            'w-full flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium',
            buttonClassName,
            className
          )}
          disabled={isLoading || props.disabled}
          {...props}
        >
          {isLoading ? (
            <Loader className={cn('animate-spin', iconSizeClasses[iconSize])} />
          ) : (
            <>
              {logo}
              <span>{text}</span>
            </>
          )}
        </Button>
      );
    }

    // If iconOnly is true, only render the icon or image (prefix or suffix)
    if (iconOnly) {
      const icon = prefixIcon || suffixIcon;
      const image = prefixImage || suffixImage;

      if (!icon && !image && !isLoading) {
        console.warn('CustomButton: iconOnly is true but no icon or image provided');
      }

      return (
        <Button
          ref={ref}
          className={cn(className)}
          size={size}
          disabled={isLoading || props.disabled}
          {...props}
        >
          {isLoading ? (
            <Loader className={cn('animate-spin', iconSizeClasses[iconSize], iconClassName)} />
          ) : (
            <>
              {icon && <span className={cn(iconSizeClasses[iconSize], iconClassName)}>{icon}</span>}
              {image && (
                <img
                  src={image}
                  alt={imageAlt}
                  className={cn(imageSizeClasses[iconSize], imageClassName)}
                />
              )}
            </>
          )}
        </Button>
      );
    }

    // Regular button with optional prefix and suffix icons/images
    return (
      <Button
        ref={ref}
        className={cn(gapClasses[gap], className)}
        size={size}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? (
          <Loader className={cn('animate-spin', iconSizeClasses[iconSize])} />
        ) : (
          <>
            {prefixIcon && (
              <span className={cn(iconSizeClasses[iconSize], iconClassName)}>{prefixIcon}</span>
            )}
            {prefixImage && (
              <img
                src={prefixImage}
                alt={imageAlt}
                className={cn(imageSizeClasses[iconSize], imageClassName)}
              />
            )}
            {children && <span>{children}</span>}
            {suffixIcon && (
              <span className={cn(iconSizeClasses[iconSize], iconClassName)}>{suffixIcon}</span>
            )}
            {suffixImage && (
              <img
                src={suffixImage}
                alt={imageAlt}
                className={cn(imageSizeClasses[iconSize], imageClassName)}
              />
            )}
          </>
        )}
      </Button>
    );
  }
);
