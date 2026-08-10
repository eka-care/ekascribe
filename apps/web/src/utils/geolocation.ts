export interface RegionInfo {
  isIndia: boolean;
  country?: string;
  countryCode?: string;
  /** State / subdivision name (e.g., "Karnataka"). */
  region?: string;
  /** ISO 3166-2 subdivision code (e.g., "KA"). */
  regionCode?: string;
}

/**
 * Detects user's region to determine if they're in India
 * Uses multiple fallback methods for reliability
 */
export async function detectUserRegion(): Promise<RegionInfo> {
  // Lazy import to avoid circular deps — geolocation runs early
  const { getTransport } = await import('@/transport');
  const transport = getTransport();

  try {
    // Method 1: Try using a geolocation API
    if (!(process.env.NEXT_PUBLIC_ENABLE_GEOIP === 'true')) {
      return { isIndia: true };
    }
    const response = await transport.request('https://ipapi.co/json/', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();

      return {
        isIndia: data.country_code === 'IN' || data.country_code === 'in',
        country: data.country_name,
        countryCode: data.country_code,
        region: data.region,
        regionCode: data.region_code,
      };
    }
  } catch (error) {
    console.warn('Primary geolocation API failed:', error);
  }

  try {
    // Method 2: Fallback to a different API
    const response = await transport.request('https://api.country.is/', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        isIndia: data.country === 'IN',
        country: data.country,
        countryCode: data.country,
      };
    }
  } catch (error) {
    console.warn('Fallback geolocation API failed:', error);
  }

  try {
    // Method 3: Try using timezone as a hint
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isIndianTimezone =
      timezone.includes('Asia/Kolkata') ||
      timezone.includes('Asia/Calcutta') ||
      timezone.includes('Indian/');

    if (isIndianTimezone) {
      return {
        isIndia: true,
        country: 'India',
        countryCode: 'IN',
      };
    }
  } catch (error) {
    console.warn('Timezone detection failed:', error);
  }

  // Default fallback - assume international for safety
  return {
    isIndia: false,
    country: 'Unknown',
    countryCode: 'Unknown',
  };
}
