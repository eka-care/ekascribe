import { getFlavour } from '@/platform';
import { Tracker } from './tracker';
import { FEATURES } from '@/config/features';
import { MixpanelProvider } from './providers/mixpanel-provider';
import { SentryProvider } from './providers/sentry-provider';

export type { TrackEvent, ErrorContext } from './types';

const MIX_PANEL_KEY = process.env.NEXT_PUBLIC_MIX_PANEL_KEY || '';
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

const tracker = new Tracker();

export function initTracking(): void {
  // On-prem: trackers are opt-in (NEXT_PUBLIC_ENABLE_* + a key) — plan Phase 5.
  if (FEATURES.mixpanel && MIX_PANEL_KEY) {
    const mixpanelProvider = new MixpanelProvider();
    mixpanelProvider.init({ token: MIX_PANEL_KEY, debug: false });
    tracker.register(mixpanelProvider);
  }

  if (FEATURES.sentry && SENTRY_DSN) {
    const sentryProvider = new SentryProvider();
    sentryProvider.init({ dsn: SENTRY_DSN });
    tracker.register(sentryProvider);
  }
}

export function identifyUser(profile: { BID: string; OID: string; UUID: string }): void {
  tracker.identify(profile.UUID, {
    BID: profile.BID,
    OID: profile.OID,
    Flavour: getFlavour(),
  });
}

export function setSessionContext(sessionId: string): void {
  tracker.setContext({ session_id: sessionId });
}

export function resetTracking(): void {
  tracker.reset();
}

export { tracker };
