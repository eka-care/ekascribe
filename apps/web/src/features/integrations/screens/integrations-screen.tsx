'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Zap, Clock, CheckCircle2, Link2, Link2Off, Headphones, Smartphone } from 'lucide-react';
import {
  Card,
  CardContent,
  CustomInput,
  Button,
  CardFooter,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@ui/src';
import ScreenHeader from '@/shared-components/page-header';
import { useWhatsApp, useCapabilities, DesktopOnly, getStorage } from '@/platform';
import type { TIntegration } from '@/fetch-client/get-voice-v1-integrations';
import useGetIntegrations from '../hooks/use-get-integrations';
import WhatsAppSetupDialog from '../components/whatsapp-setup-dialog';
import WhatsAppIcon from '../components/whatsapp-icon';

type TDisplayIntegration = Omit<TIntegration, 'icon'> & {
  icon: string | React.ReactNode;
  actionType?: 'toggle' | 'contact_support' | 'coming_soon' | 'whatsapp_setup';
};

const CHANNEL_INTEGRATIONS: TDisplayIntegration[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp via Linked Device',
    description: 'Send prescriptions and clinical notes directly to your patients via WhatsApp.',
    icon: <WhatsAppIcon className="w-8 h-8 text-[#25D366]" />,
    integration_status: 'available',
    link_status: 'disabled',
    actionType: 'whatsapp_setup',
    tags: ['Free'],
    category: 'whatsapp',
  },
];

type IntegrationStatus = 'available' | 'coming_soon';

const getStatusBadge = (status: IntegrationStatus) => {
  switch (status) {
    case 'available':
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Available
        </Badge>
      );
    case 'coming_soon':
      return (
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Coming Soon
        </Badge>
      );
  }
};

const IntegrationsPage = () => {
  const searchParams = useSearchParams();
  const whatsapp = useWhatsApp();
  const capabilities = useCapabilities();
  const hasWhatsApp = capabilities.has('whatsapp-linked-device');

  const [whatsappStatus, setWhatsappStatus] = useState('disconnected');
  const [whatsappPhoneNumber, setWhatsappPhoneNumber] = useState<string | null>(null);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const defaultTab = searchParams.get('tab') === 'emr' ? 'emr' : (hasWhatsApp ? 'apps' : 'emr');
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const tab = searchParams.get('tab') === 'emr' ? 'emr' : (hasWhatsApp ? 'apps' : 'emr');
    setActiveTab(tab);
  }, [searchParams, hasWhatsApp]);

  const { integrations, toggleIntegration } = useGetIntegrations();

  useEffect(() => {
    if (!whatsapp) return;
    whatsapp.getStatus().then(({ status, phoneNumber }) => {
      setWhatsappStatus(status);
      setWhatsappPhoneNumber(phoneNumber ?? null);
    }).catch(() => {});
    return whatsapp.onStatusChange((status) => setWhatsappStatus(status));
  }, [whatsapp]);

  useEffect(() => {
    if (getStorage().session.get('open_whatsapp_setup') === 'true') {
      getStorage().session.remove('open_whatsapp_setup');
      setShowSetupDialog(true);
    }
  }, []);

  const filteredIntegrations = integrations.filter((i) =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredChannels = CHANNEL_INTEGRATIONS.filter((i) =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderCard = (integration: TDisplayIntegration) => {
    const isWhatsApp = integration.actionType === 'whatsapp_setup';

    return (
      <Card
        key={integration.id}
        className="group relative overflow-hidden border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 py-4"
      >
        <div className="absolute inset-0 bg-linear-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <CardContent className="relative z-10 px-4 flex flex-col gap-3 flex-1">
          <div className="flex space-x-2 items-start justify-between">
            <div className="transform group-hover:scale-105 transition-transform duration-300 bg-background border border-border/50 p-2 rounded-lg shadow-sm shrink-0 w-14 h-14 flex items-center justify-center">
              {typeof integration.icon === 'string' ? (
                <img
                  src={integration.icon}
                  alt={integration.name}
                  width={48}
                  height={48}
                  className="object-contain"
                />
              ) : (
                integration.icon
              )}
            </div>
            <div className="flex flex-col gap-1 items-end">
              {getStatusBadge(integration.integration_status)}
              {integration.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {integration.name}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {integration.description}
            </p>
          </div>
        </CardContent>

        {isWhatsApp && whatsappStatus === 'connected' && whatsappPhoneNumber && (
          <div className="mx-4 mb-3 border rounded-lg px-3 py-2.5 flex items-center gap-3 bg-muted/40">
            <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Linked Number
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-foreground">{whatsappPhoneNumber}</span>
                <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  Active
                </span>
              </div>
            </div>
          </div>
        )}

        <CardFooter className="px-4 z-10">
          {isWhatsApp ? (
            whatsappStatus === 'connected' ? (
              <Button
                variant="outline"
                className="w-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  whatsapp?.disconnect();
                }}
              >
                <Link2Off className="w-4 h-4" />
                Disable
              </Button>
            ) : (
              <Button
                variant="default"
                className="w-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSetupDialog(true);
                }}
              >
                <Link2 className="w-4 h-4" />
                Enable
              </Button>
            )
          ) : integration.integration_status === 'available' ? (
            integration.link_status === 'contact_support' ? (
              <Button
                variant="outline"
                className="w-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  window.$crisp?.push(['do', 'chat:show']);
                  window.$crisp?.push(['do', 'chat:open']);
                }}
              >
                <Headphones className="w-4 h-4" />
                Contact Support
              </Button>
            ) : integration.link_status === 'enabled' ? (
              <Button
                variant="outline"
                className="w-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleIntegration(integration.id);
                }}
              >
                <Link2Off className="w-4 h-4" />
                Disable
              </Button>
            ) : (
              <Button
                variant="default"
                className="w-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleIntegration(integration.id);
                }}
              >
                <Link2 className="w-4 h-4" />
                Enable
              </Button>
            )
          ) : (
            <Button variant="outline" className="w-full" disabled>
              <Clock className="w-4 h-4" />
              Coming Soon
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="flex flex-col w-full min-h-screen">
      <ScreenHeader title="Integrations" />

      <div className="flex flex-col gap-5 px-6 py-4">
        {/* Hero Section */}
        <div className="rounded-xl bg-linear-to-br from-primary/5 via-primary/10 to-primary/5 p-4 border border-primary/10">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-primary">Supercharge your workflow</span>
          </div>
          <p className="text-xl font-bold text-foreground mb-1">Connect your favorite tools</p>
          <p className="text-sm text-muted-foreground">
            Integrate EkaScribe with your existing healthcare systems. Automate documentation and
            streamline your clinical workflow.
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-md">
          <CustomInput
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            leftComponent={<Search className="text-muted-foreground w-4 h-4" />}
            className="border-border bg-background text-foreground shadow-sm"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <DesktopOnly>
            <TabsList className="mb-4">
              <TabsTrigger value="apps">Apps &amp; Channels</TabsTrigger>
              <TabsTrigger value="emr">EMR/HIS Integrations</TabsTrigger>
            </TabsList>
          </DesktopOnly>

          <TabsContent value="apps">
            <DesktopOnly>
              <div className="grid gap-4 lg:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredChannels.map((integration) => renderCard(integration))}
              </div>
            </DesktopOnly>
          </TabsContent>

          <TabsContent value="emr">
            <div className="grid gap-4 lg:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredIntegrations.map((integration) => renderCard(integration as TDisplayIntegration))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <WhatsAppSetupDialog open={showSetupDialog} onOpenChange={setShowSetupDialog} />
    </div>
  );
};

export default IntegrationsPage;
