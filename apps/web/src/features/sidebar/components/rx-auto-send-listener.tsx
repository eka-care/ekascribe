'use client';

import { useRxAutoSend } from '../hooks/use-rx-auto-send';

export default function RxAutoSendListener() {
  useRxAutoSend();
  return null;
}
