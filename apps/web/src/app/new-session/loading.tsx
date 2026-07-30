'use client';

import { Skeleton } from '@ui/src';

const HomeLoadingSkeleton = () => {
  return (
    <div className="flex flex-col space-y-6 h-full w-full bg-[#F5F8FF]">
      {/* Session Header Skeleton */}
      <div className="flex items-start justify-between w-full p-4">
        <div className="flex flex-col gap-2.5">
          {/* Patient Name / Directory Toggle */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full bg-card" />
            <Skeleton className="h-6 w-48 bg-card" />
          </div>

          {/* Session Level Preferences */}
          <div className="flex gap-4 items-center">
            <Skeleton className="h-8 w-32 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        </div>

        {/* Microphone Selector Skeleton */}
        <div className="flex flex-col items-end gap-3">
          <Skeleton className="h-10 w-64 rounded-lg" />
        </div>
      </div>

      {/* Session Body Skeleton */}
      <div className="flex-1 w-full relative flex flex-col overflow-hidden rounded-lg min-h-0 h-dvh bg-white m-4 p-4">
        {/* Tabs List Skeleton */}
        {/* <div className="flex items-start w-fit gap-2 h-12">
          <Skeleton className="h-10 w-40 rounded-tl-xl rounded-tr-xl" />
          <Skeleton className="h-10 w-40 rounded-tl-xl rounded-tr-xl" />
        </div> */}
        <div className="pt-4 w-full">
          <SessionBodySkeleton />
        </div>

        {/* Session Footer Skeleton */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 p-2 flex items-center gap-2 bg-white border border-gray-200 rounded-xl shadow-lg">
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export const SessionBodySkeleton = () => {
  return (
    <div className="flex-1 overflow-hidden space-y-6 h-full px-4">
      <div className="space-y-3 mt-8">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-3/4 bg-[#E5E7EB]" />
          <Skeleton className="h-3 w-full bg-[#E5E7EB]" />
          <Skeleton className="h-3 w-5/6 bg-[#E5E7EB]" />
        </div>

        <div className="pt-6 space-y-3">
          <Skeleton className="h-3 w-full bg-[#E5E7EB]" />
          <Skeleton className="h-3 w-2/3 bg-[#E5E7EB]" />
          <Skeleton className="h-3 w-11/12 bg-[#E5E7EB]" />
        </div>

        <div className="pt-6 space-y-3">
          <Skeleton className="h-3 w-4/5 bg-[#E5E7EB]" />
          <Skeleton className="h-3 w-full bg-[#E5E7EB]" />
          <Skeleton className="h-3 w-3/5 bg-[#E5E7EB]" />
        </div>
      </div>
    </div>
  );
};

export default HomeLoadingSkeleton;
