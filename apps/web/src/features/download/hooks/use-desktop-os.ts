'use client';

import { useEffect, useState } from 'react';

export type DesktopOS = 'mac' | 'windows';

// Which installer to lead with. Defaults to 'mac' (the Figma default) so the
// statically exported HTML and the first client render agree, then corrects on
// mount once navigator is readable.
export function useDesktopOS(): DesktopOS {
  const [os, setOs] = useState<DesktopOS>('mac');

  useEffect(() => {
    if (/Win(dows|32|64)|WOW64/i.test(navigator.userAgent)) setOs('windows');
  }, []);

  return os;
}
