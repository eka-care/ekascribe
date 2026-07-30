const CHANNEL_NAME = 'print-config-updates';
const EVENT_TYPE = 'print-config-updated';

type PrintConfigEvent = { type: typeof EVENT_TYPE };

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(CHANNEL_NAME);
}

export function broadcastPrintConfigUpdated(): void {
  const channel = getChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: EVENT_TYPE } satisfies PrintConfigEvent);
  } finally {
    channel.close();
  }
}

export function subscribeToPrintConfigUpdates(onUpdate: () => void): () => void {
  const channel = getChannel();
  if (!channel) return () => {};
  const handler = (event: MessageEvent<PrintConfigEvent>) => {
    if (event.data?.type === EVENT_TYPE) onUpdate();
  };
  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
    channel.close();
  };
}
