import { getFlavour } from '@/platform';
import { Tracker } from './tracker';
// import { FEATURES } from '@/config/features';
// import { SentryProvider } from './providers/sentry-provider';

export type { TrackEvent, ErrorContext } from './types';

// const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

const tracker = new Tracker();

export function initTracking(): void {
  // Sentry error tracking — disabled for now; re-enable by uncommenting and
  // setting NEXT_PUBLIC_ENABLE_SENTRY + NEXT_PUBLIC_SENTRY_DSN.
  // if (FEATURES.sentry && SENTRY_DSN) {
  //   const sentryProvider = new SentryProvider();
  //   sentryProvider.init({ dsn: SENTRY_DSN });
  //   tracker.register(sentryProvider);
  // }
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
