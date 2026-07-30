import { Button } from '@ui/src';
import { Loader } from 'lucide-react';
import { ComponentProps, forwardRef } from 'react';

export interface ButtonWrapperProps extends ComponentProps<typeof Button> {
  isLoading?: boolean;
}

const ButtonWrapper = forwardRef<HTMLButtonElement, ButtonWrapperProps>(
  ({ children, isLoading, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        {...props}
        disabled={isLoading || props.disabled}
        className={`relative cursor-pointer ${props.className || ''}`}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader className="w-4 h-4 animate-spin" />
          </div>
        )}
        <span
          className={`${
            isLoading ? 'invisible' : ''
          } inline-flex items-center justify-center gap-2`}
        >
          {children}
        </span>
      </Button>
    );
  }
);

export default ButtonWrapper;
