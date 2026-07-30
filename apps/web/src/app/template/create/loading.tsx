'use client';

import { Card, Skeleton, Separator } from '@ui/src';

const CreateTemplateLoadingSkeleton = () => {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Template Header Skeleton */}
      <div className="sticky top-0 w-full z-20 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 gap-2 sm:gap-4">
          <div className="flex items-center space-x-2 sm:space-x-3 h-9 sm:h-10 min-w-0 flex-1">
            <div className="h-5 sm:h-6">
              <Separator orientation="vertical" />
            </div>
            <Skeleton className="h-5 sm:h-6 w-20 sm:w-24" />
          </div>

          {/* Buttons Skeleton */}
          <div className="flex items-center gap-2 h-9 sm:h-10 shrink-0">
            <Skeleton className="h-8 sm:h-9 w-20 sm:w-28 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 w-full overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-3 h-full">
        {/* Template Container Skeleton */}
        <div className="h-full lg:col-span-2 p-3 sm:p-4 lg:overflow-y-auto">
          {/* Template Form Skeleton */}
          <Card className="p-4 sm:p-6 border-border">
            <div className="space-y-4">
              {/* Title Input Skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full max-w-sm" />
              </div>

              {/* Template Type Selection Skeleton */}
              <div className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              </div>

              {/* Description Input Skeleton */}
              <div className="space-y-2 pt-4 border-t border-border h-[calc(100vh-25rem)]">
                <Skeleton className="h-4 w-32" />

                <div className="space-y-4 flex flex-col">
                  {[1, 2, 3, 4].map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-3 h-10">
                        <Skeleton className="h-4 w-4" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Custom Section Side Sheet Skeleton - Hidden on mobile */}
        <div className="hidden lg:block lg:col-span-1 h-full overflow-y-auto border-l bg-muted/20 border-border p-4 sm:p-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            <div className="space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="space-y-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>

            <div className="space-y-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1 rounded-lg" />
              <Skeleton className="h-9 flex-1 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTemplateLoadingSkeleton;
