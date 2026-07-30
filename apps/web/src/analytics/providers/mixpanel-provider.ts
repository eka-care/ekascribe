import mixpanel from 'mixpanel-browser';
import type { TrackEvent, TrackingProvider, EventKind } from '../types';

export class MixpanelProvider implements TrackingProvider {
  readonly name = 'mixpanel';
  readonly handles: EventKind[] = ['track'];

  init(config: Record<string, unknown>): void {
    mixpanel.init(config.token as string, { debug: config.debug as boolean });
  }

  track(event: TrackEvent): void {
    const properties: Record<string, unknown> = {};
    if (event.type) properties.event_type = event.type;
    if (event.properties) Object.assign(properties, event.properties);
    mixpanel.track(event.name, properties);
  }

  error(): void {
    // Mixpanel does not handle errors
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    mixpanel.identify(userId);
    if (traits) mixpanel.register(traits);
  }

  setContext(context: Record<string, string>): void {
    mixpanel.register(context);
  }

  reset(): void {
    mixpanel.reset();
  }
}
