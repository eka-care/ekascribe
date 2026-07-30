'use client';

import { Card, CardContent, CardFooter, Skeleton } from '@ui/src';
import ScreenHeader from '@/shared-components/page-header';

const IntegrationCardSkeleton = () => (
  <Card className="border-border py-4">
    <CardContent className="px-4 flex flex-col gap-3">
      {/* Top row: Icon + Badge */}
      <div className="flex items-start justify-between">
        <Skeleton className="w-14 h-14 rounded-lg" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      {/* Name & Description */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </CardContent>

    <CardFooter className="px-4">
      <Skeleton className="h-10 w-full rounded-md" />
    </CardFooter>
  </Card>
);

const IntegrationsLoadingSkeleton = () => {
  return (
    <div className="flex flex-col w-full min-h-screen">
      {/* Header */}
      <ScreenHeader title="Integrations" />

      <div className="flex flex-col gap-5 px-6 py-4">
        {/* Hero Section Skeleton */}
        <div className="rounded-xl bg-muted/50 p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>

        {/* Search Bar Skeleton */}
        <div className="max-w-md">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>

        {/* Integration Cards Grid Skeleton */}
        <div className="grid gap-4 lg:gap-6 grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <IntegrationCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntegrationsLoadingSkeleton;
