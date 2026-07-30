import type { TrackEvent, ErrorContext, TrackingProvider, EventKind } from './types';

export class Tracker {
  private providers: TrackingProvider[] = [];

  register(provider: TrackingProvider): void {
    this.providers.push(provider);
  }

  private dispatch(kind: EventKind, fn: (p: TrackingProvider) => void): void {
    for (const p of this.providers) {
      if (p.handles.includes(kind)) {
        try { fn(p); } catch { /* provider failure should never break the app */ }
      }
    }
  }

  track(event: TrackEvent): void {
    this.dispatch('track', (p) => p.track(event));
  }

  log(event: TrackEvent): void {
    this.dispatch('log', (p) => p.track(event));
  }

  error(error: unknown, context: ErrorContext): void {
    this.dispatch('error', (p) => p.error(error, context));
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    for (const p of this.providers) {
      try { p.identify(userId, traits); } catch { /* */ }
    }
  }

  setContext(context: Record<string, string>): void {
    for (const p of this.providers) {
      try { p.setContext(context); } catch { /* */ }
    }
  }

  reset(): void {
    for (const p of this.providers) {
      try { p.reset(); } catch { /* */ }
    }
  }
}
