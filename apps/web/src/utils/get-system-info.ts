// eslint-disable-next-line
//@ts-nocheck

import { TSystemInfo } from '@/constants/types';

const getSystemInfo = async () => {
  const systemInfo: TSystemInfo = {
    platform: navigator?.platform || 'Not available',
    language: navigator.language || 'Not available',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  };

  // Add potentially experimental/less-supported properties
  if (navigator.hardwareConcurrency !== undefined) {
    systemInfo.hardwareConcurrency = navigator.hardwareConcurrency;
  }

  if (navigator?.deviceMemory !== undefined) {
    systemInfo.deviceMemory = navigator.deviceMemory;
  }

  if (navigator.connection !== undefined) {
    const networkData = navigator.connection;
    systemInfo.networkInfo = {
      effectiveType: networkData?.effectiveType || 'Not available',
      latency: networkData?.rrt || 0,
      downloadSpeed: networkData?.downlink || 0,
      connectionType: networkData?.type || 'Not available',
    };
  }

  return systemInfo;
};

export default getSystemInfo;
