'use client';

import { Card, CardHeader, CardContent, CardFooter, Skeleton, Separator } from '@ui/src';

const TemplatesLoadingSkeleton = () => {
  return (
    <div className="h-full w-full">
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

      {/* Templates Grid Skeleton */}
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-3 sm:gap-4 mb-4">
          <Skeleton className="h-9 w-full sm:w-48" />
          <Skeleton className="h-9 w-full sm:w-64" />
        </div>
        <div className="grid gap-3 sm:gap-4 lg:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Card key={item} className="w-full max-h-60 border-border gap-3">
              <CardHeader className="flex p-3 sm:p-4">
                <div className="flex items-start justify-between">
                  <Skeleton className="h-5 sm:h-6 w-32 sm:w-48 mb-2" />
                </div>
              </CardHeader>

              <CardContent className="space-y-4 overflow-hidden flex-1 p-3 sm:p-4 pt-0">
                <div className="space-y-2">
                  <Skeleton className="h-3 sm:h-4 w-full" />
                  <Skeleton className="h-3 sm:h-4 w-4/5" />
                  <Skeleton className="h-3 sm:h-4 w-3/5" />
                </div>
              </CardContent>

              <CardFooter className="border-t border-border p-3 sm:p-4">
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex space-x-2 items-center">
                    <Skeleton className="h-7 sm:h-8 w-14 sm:w-16 rounded" />
                    <Skeleton className="h-7 sm:h-8 w-7 sm:w-8 rounded" />
                  </div>
                  <Skeleton className="h-5 sm:h-6 w-10 sm:w-11 rounded-full" />
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TemplatesLoadingSkeleton;
