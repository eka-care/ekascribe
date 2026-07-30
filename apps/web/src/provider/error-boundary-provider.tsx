'use client';

import ErrorBoundary from '@/shared-components/error-boundary';

const ErrorBoundaryProvider = ({ children }: { children: React.ReactNode }) => {
  return <ErrorBoundary>{children}</ErrorBoundary>;
};

export default ErrorBoundaryProvider;
