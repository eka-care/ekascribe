'use client';

import { useEffect } from 'react';
import useVoice2RxStore from '@/store/store';

declare global {
  interface Window {
    $crisp: unknown[];
  }
}

const CrispUserSync = () => {
  const loggedInUserDetails = useVoice2RxStore((state) => state.loggedInUserDetails);

  useEffect(() => {
    if (!loggedInUserDetails || !window.$crisp) return;

    const { fn, mn, ln, s, uuid } = loggedInUserDetails;
    const fullName = [s, fn, mn, ln].filter(Boolean).join(' ');

    if (fullName.trim()) {
      window.$crisp.push(['set', 'user:nickname', [fullName.trim()]]);
    }

    if (uuid) {
      window.$crisp.push([
        'set',
        'session:data',
        [
          [
            ['user_id', uuid],
            ['plan', loggedInUserDetails.is_paid_doc ? 'paid' : 'free'],
            ['client', 'Ekascribe-Website'],
          ],
        ],
      ]);
    }
  }, [loggedInUserDetails]);

  return null;
};

export default CrispUserSync;
