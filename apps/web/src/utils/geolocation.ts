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

export type TPricing = {
  monthly: TPricingData;
  yearly: TPricingData;
  region: string;
};

export type TPricingData = {
  price: string;
  rawPrice: number;
  currency: string;
  symbol: string;
  link: string;
};

/**
 * Gets pricing configuration based on region
 */
export function getPricingByRegion(isIndia: boolean): TPricing {
  if (isIndia) {
    return {
      monthly: {
        price: '₹1,499',
        rawPrice: 1499,
        currency: 'INR',
        symbol: '₹',
        link: 'https://buy.stripe.com/7sYfZj8t46BnfTvgG67ss00',
      },
      yearly: {
        price: '₹14,990',
        rawPrice: 14990,
        currency: 'INR',
        symbol: '₹',
        link: 'https://buy.stripe.com/bJecN7eRs4tffTvgG67ss01',
      },
      region: 'India',
    };
  } else {
    return {
      monthly: {
        price: '$49',
        rawPrice: 49,
        currency: 'USD',
        symbol: '$',
        link: 'https://buy.stripe.com/7sY6oJ9x81h30YB4Xo7ss02',
      },
      yearly: {
        price: '$499',
        rawPrice: 499,
        currency: 'USD',
        symbol: '$',
        link: 'https://buy.stripe.com/5kQ8wR24GgbX8r34Xo7ss03',
      },
      region: 'International',
    };
  }
}
