import { notFound } from 'next/navigation';
import { FEATURES } from '@/config/features';
import IntegrationsPage from '@/features/integrations/screens/integrations-screen';

const Integrations = () => {
  // Feature-flagged off by default for on-prem (plan decision #8).
  if (!FEATURES.publishIntegrations) notFound();
  return <IntegrationsPage />;
};

export default Integrations;
