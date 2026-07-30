'use client';

import { Card, CardContent, CardHeader } from '@ui/src';
import { ReactNode } from 'react';

type PreferenceCardProps = {
  title: string;
  description: string;
  CardIcon: ReactNode;
  children: ReactNode;
};

const PreferenceCard = ({ title, description, CardIcon, children }: PreferenceCardProps) => {
  return (
    <Card className="border-border py-4 w-full">
      <CardHeader className="px-4 gap-0">
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2.5">
            {CardIcon}
            <p className="font-semibold text-sm leading-5">{title}</p>
          </div>
          <div className="text-xs text-muted-foreground leading-4">{description}</div>
        </div>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
};

export default PreferenceCard;
