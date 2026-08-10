'use client';

import { Card, Skeleton, Separator } from '@ui/src';

const TemplatesLoadingSkeleton = () => {
  return (
    <div className="min-h-full w-full bg-[#F5F8FF]">
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
            <Skeleton className="h-8 sm:h-9 w-8 sm:w-36 rounded-lg" />
            <Skeleton className="h-8 sm:h-9 w-8 sm:w-44 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Tabs + search row skeleton */}
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center w-full gap-3 sm:gap-4 mb-3">
          <div className="flex flex-1 items-end w-full gap-2 border-b border-[#D1D1D1] pb-3">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-60 shrink-0 rounded-lg" />
        </div>

        {/* Cards grid skeleton — mirrors the new card layout */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Card
              key={item}
              className="w-full min-h-55 justify-between gap-2 rounded-lg border-border p-4 shadow-none"
            >
              <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center justify-between w-full">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-7 w-7 rounded-lg" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-6 w-40" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between w-full border-t border-[#EDEDED] pt-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-11 rounded-full" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TemplatesLoadingSkeleton;
