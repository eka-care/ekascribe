'use client';

import React from 'react';
import { Button, Card, CardHeader } from '@ui/src';
import { Info, X } from 'lucide-react';

interface BannerComponentProps {
  title: string;
  subtitle?: string;
  ActionComponent?: React.FC;
  clearBannerInfo: () => void;
  showCrossIcon?: boolean;
}

const BannerComponent = ({
  title,
  subtitle,
  ActionComponent,
  clearBannerInfo,
  showCrossIcon = true,
}: BannerComponentProps) => {
  return (
    <div
      className={`fixed top-0 left-0 w-full z-50 transform transition-all duration-400 ease-in-out ${
        title ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      style={{
        visibility: title ? 'visible' : 'hidden',
        height: title ? 'auto' : '0',
      }}
    >
      <Card className="bg-yellow-50 rounded-none border-border py-3 shadow-xs">
        <CardHeader className="px-4 flex sm:items-center items-start justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-yellow-700" />
            <div className="flex flex-col text-yellow-700">
              <p className="font-semibold text-sm leading-5">{title}</p>
              <p className="font-normal text-xs leading-4">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-start sm:items-center space-x-2">
            {ActionComponent ? <ActionComponent /> : null}

            {showCrossIcon ? (
              <Button onClick={() => clearBannerInfo()} className="cursor-pointer" variant="ghost">
                <X className="w-4 h-4" />
              </Button>
            ) : null}
          </div>
        </CardHeader>
      </Card>
    </div>
  );
};

export default BannerComponent;
