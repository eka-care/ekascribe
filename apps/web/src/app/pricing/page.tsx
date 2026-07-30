import { notFound } from 'next/navigation';
import { FEATURES } from '@/config/features';
import PricingPage from '@/features/payments/screens/pricing-page';

export default function Pricing() {
  // Feature-flagged off by default for on-prem (plan decision #8).
  if (!FEATURES.payments) notFound();
  return <PricingPage />;
}
