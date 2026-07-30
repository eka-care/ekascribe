import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@ui/src/shadcn-ui/lib/utils';

function CustomTooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function CustomTooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <CustomTooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </CustomTooltipProvider>
  );
}

function CustomTooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

interface CustomTooltipContentProps extends React.ComponentProps<typeof TooltipPrimitive.Content> {
  arrowClassName?: string;
}

function CustomTooltipContent({
  className,
  sideOffset = 0,
  children,
  arrowClassName,
  ...props
}: CustomTooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-popover border border-border text-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance',
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className={`z-50 size-2.5 translate-y-[calc(-50%-0px)] rotate-45 rounded-xs ${
            arrowClassName || 'bg-white fill-white border-r border-b border-border'
          }`}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { CustomTooltip, CustomTooltipTrigger, CustomTooltipContent };
