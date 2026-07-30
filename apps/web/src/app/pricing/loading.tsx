'use client';

import { Card, CardContent, CardHeader, Skeleton } from '@ui/src';

const PricingLoadingSkeleton = () => {
  return (
    <div className="min-h-screen bg-background w-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Title Section */}
        <div className="text-center">
          <Skeleton className="h-10 w-64 mx-auto mb-2" />
          <Skeleton className="h-6 w-96 mx-auto mb-4" />

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12">
          {/* Free Plan Card */}
          <Card className="border-border relative">
            <CardHeader className="text-center pb-8">
              <Skeleton className="h-6 w-20 mx-auto mb-2" />
              <div className="mb-4">
                <Skeleton className="h-12 w-16 mx-auto mb-1" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
              <Skeleton className="h-10 w-full" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pro Plan Card */}
          <Card className="relative border-primary">
            {/* Popular Badge */}
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>

            <CardHeader className="text-center pb-8 pt-8">
              <Skeleton className="h-6 w-16 mx-auto mb-2" />
              <div className="mb-4">
                <Skeleton className="h-12 w-24 mx-auto mb-1" />
                <Skeleton className="h-4 w-32 mx-auto" />
              </div>
              <Skeleton className="h-10 w-full" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border relative">
            <CardHeader className="text-center pb-8">
              <Skeleton className="h-6 w-20 mx-auto mb-2" />
              <div className="mb-4">
                <Skeleton className="h-12 w-16 mx-auto mb-1" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
              <Skeleton className="h-10 w-full" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-8 w-48 mx-auto mb-8" />

          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((item) => (
              <Card key={item} className="border-border">
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <Skeleton className="h-5 flex-1 mr-4" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingLoadingSkeleton;
