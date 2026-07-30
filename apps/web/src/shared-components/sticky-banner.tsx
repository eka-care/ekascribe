'use client';

import { useEffect } from 'react';
import useVoice2RxStore from '@/store/store';
import BannerComponent from '@/shared-components/banner/banner-component';

const StickyBanner = () => {
  const bannerTitle = useVoice2RxStore((state) => state.bannerTitle);
  const bannerSubtitle = useVoice2RxStore((state) => state.bannerSubtitle);
  const bannerActionComponent = useVoice2RxStore((state) => state.bannerActionComponent);
  const clearBannerInfo = useVoice2RxStore((state) => state.clearBannerInfo);
  const loggedInUserDetails = useVoice2RxStore((state) => state.loggedInUserDetails);
  const showBannerCrossIcon = useVoice2RxStore((state) => state.showBannerCrossIcon);
  const bannerTimeout = useVoice2RxStore((state) => state.bannerTimeout);
  const showForAllUsers = useVoice2RxStore((state) => state.showForAllUsers);

  useEffect(() => {
    if (bannerTimeout) {
      const timer = setTimeout(() => {
        clearBannerInfo();
      }, bannerTimeout);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [bannerTimeout]);

  // Hide banner if no title, or if user is paid AND banner is not marked to show for all users
  if (!bannerTitle || (loggedInUserDetails?.is_paid_doc && !showForAllUsers)) return null;

  return (
    <BannerComponent
      title={bannerTitle}
      subtitle={bannerSubtitle}
      ActionComponent={bannerActionComponent}
      clearBannerInfo={clearBannerInfo}
      showCrossIcon={showBannerCrossIcon}
    />
  );
};

export default StickyBanner;
