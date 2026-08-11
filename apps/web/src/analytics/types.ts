export type EventKind = 'track' | 'log' | 'error';

export interface TrackEvent {
  name: string;
  type?: string;
  properties?: Record<string, unknown>;
}

export interface ErrorContext {
  domain: 'recording' | 'processing' | 'auth' | 'api' | 'infra' | 'crash';
  component?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface TrackingProvider {
  readonly name: string;
  readonly handles: EventKind[];
  init(config: Record<string, unknown>): void;
  track(event: TrackEvent): void;
  error(error: unknown, context: ErrorContext): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  setContext(context: Record<string, string>): void;
  reset(): void;
}
