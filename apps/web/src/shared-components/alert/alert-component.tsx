import { Alert, AlertDescription } from '@ui/src';
import { AlertCircle, TriangleAlert } from 'lucide-react';

type TAlertComponentProps = {
  message: string;
  Icon?: React.FC;
  ActionComponent?: React.FC;
  listHeader?: string;
  listItems?: string[];
  type?: 'warning' | 'error' | 'success';
};

const DEFAULT_ICONS: Record<string, React.ReactNode> = {
  warning: <TriangleAlert className="text-yellow-8 w-4 h-4" />,
  error: <AlertCircle className="text-destructive w-4 h-4" />,
};

const AlertComponent = ({
  Icon,
  message,
  ActionComponent,
  listHeader,
  listItems,
  type,
}: TAlertComponentProps) => {
  const alertBgColor = type === 'warning' ? 'bg-yellow-2' : 'bg-destructive/20';
  const defaultIcon = type ? DEFAULT_ICONS[type] : null;

  return (
    <Alert className={`${alertBgColor} text-sm border-border rounded-lg`}>
      <AlertDescription className="flex items-start gap-2 text-secondary-foreground">
        {Icon ? (
          <div className="w-fit pt-[3px]">
            <Icon />
          </div>
        ) : defaultIcon ? (
          <div className="w-fit pt-[3px] shrink-0">{defaultIcon}</div>
        ) : null}
        <div className="flex flex-col space-y-0.5">
          <p className="font-medium">{message}</p>

          <p className="font-light">{listHeader}</p>

          {listItems && listItems.length > 0 ? (
            <>
              <ol className="list-decimal">
                {listItems.map((item, index) => (
                  <li key={index} className="font-light">
                    {item}
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {ActionComponent ? <ActionComponent /> : null}
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default AlertComponent;
