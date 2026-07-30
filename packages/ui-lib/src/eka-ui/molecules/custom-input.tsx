import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface CustomInputProps extends Omit<React.ComponentProps<typeof Input>, 'className'> {
  className?: string;
  leftComponent?: any;
  rightComponent?: any;
}

export function CustomInput({
  className,
  leftComponent,
  rightComponent,
  ...inputProps
}: CustomInputProps) {
  const hasLeftComponent = !!leftComponent;
  const hasRightComponent = !!rightComponent;

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {hasLeftComponent && (
          <div className="absolute left-3 z-10 text-muted-foreground flex items-center justify-center">
            {leftComponent}
          </div>
        )}

        {/* Input */}
        <Input
          {...inputProps}
          className={cn(
            {
              'pl-8': hasLeftComponent,
              'pr-8': hasRightComponent,
            },
            className
          )}
        />

        {/* Right Component */}
        {hasRightComponent && (
          <div className="absolute right-3 z-10 w-4 h-4 text-muted-foreground flex items-center justify-center">
            {rightComponent}
          </div>
        )}
      </div>
    </div>
  );
}
