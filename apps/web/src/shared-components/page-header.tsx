'use client';

import React from 'react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@ui/src';
import Link from 'next/link';

export interface BreadcrumbItemType {
  label: string;
  href: string;
  isCurrentPage?: boolean;
}

interface PageHeaderProps {
  // Either title or breadcrumbs should be provided
  title?: string;
  breadcrumbs?: BreadcrumbItemType[];
  children?: React.ReactNode; // Right side content (buttons, actions, etc.)
}

const ScreenHeader = ({ title, breadcrumbs, children }: PageHeaderProps) => {
  return (
    <div className="sticky top-0 w-full z-20 bg-card border-b border-border transition-all duration-300">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 gap-2 sm:gap-4">
          {/* Render breadcrumbs if provided, otherwise render title */}
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap">
                {breadcrumbs.map((item, index) => (
                  <React.Fragment key={index}>
                    <BreadcrumbItem className="min-w-0">
                      {item.isCurrentPage ? (
                        <BreadcrumbPage className="text-sm sm:text-lg font-bold truncate max-w-[120px] sm:max-w-none">
                          {item.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link
                            href={item.href as any}
                            className="text-sm sm:text-lg text-muted-foreground font-semibold hover:text-foreground"
                          >
                            {item.label}
                          </Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <p className="text-sm sm:text-lg font-bold flex-1">{title}</p>
          )}

        {children && (
          <div className="flex items-center gap-2 h-9 sm:h-10 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScreenHeader;
