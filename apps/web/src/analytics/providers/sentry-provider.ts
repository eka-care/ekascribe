import * as Sentry from '@sentry/browser';
import type { TrackEvent, ErrorContext, TrackingProvider, EventKind } from '../types';

const MILESTONE_EVENTS_BY_NAME = new Set([
  'processing_started',
  'processing_completed',
  'processing_failed',
  'discard_session',
  'stop_processing',
  'upload_audio_to_notes',
  'upload_transcript_to_notes',
  'agui_streaming_started',
  'retry_attempted',
]);

const MILESTONE_EVENTS_BY_TYPE = new Set([
  'start_recording',
  'pause_recording',
  'resume_recording',
  'end_recording',
  'upload_recording',
]);

function isMilestone(event: TrackEvent): boolean {
  if (event.type && MILESTONE_EVENTS_BY_TYPE.has(event.type)) return true;
  return MILESTONE_EVENTS_BY_NAME.has(event.name);
}

export class SentryProvider implements TrackingProvider {
  readonly name = 'sentry';
  readonly handles: EventKind[] = ['log', 'error'];

  init(config: Record<string, unknown>): void {
    if (!config.dsn) return;
    Sentry.init({
      dsn: config.dsn as string,
      environment: (config.environment as string) ?? 'production',
      release: config.release as string | undefined,
      beforeBreadcrumb(breadcrumb) {
        const dominated = ['fetch', 'xhr', 'console', 'ui.click', 'ui.input'];
        if (breadcrumb.category && dominated.includes(breadcrumb.category)) return null;
        return breadcrumb;
      },
    });
  }

  track(event: TrackEvent): void {
    const eventLabel = event.type ?? event.name;

    Sentry.addBreadcrumb({
      category: event.type ?? 'app',
      message: eventLabel,
      data: event.properties,
      level: 'info',
    });

    if (isMilestone(event)) {
      const sessionId = event.properties?.session_id as string | undefined;
      Sentry.captureMessage(eventLabel, {
        level: 'info',
        tags: sessionId ? { session_id: sessionId } : {},
        extra: event.properties,
      });
    }
  }

  error(error: unknown, context: ErrorContext): void {
    const sessionId = context.extra?.session_id as string | undefined;
    const tags: Record<string, string> = {
      domain: context.domain,
      ...(context.component ? { component: context.component } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...context.tags,
    };
    Sentry.captureException(error, {
      tags,
      extra: context.extra,
    });
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    Sentry.setUser({ id: userId, ...traits });
  }

  setContext(context: Record<string, string>): void {
    for (const [key, value] of Object.entries(context)) {
      Sentry.setTag(key, value);
    }
  }

  reset(): void {
    Sentry.setUser(null);
  }
}
