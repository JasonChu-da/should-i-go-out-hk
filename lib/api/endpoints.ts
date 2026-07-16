export const HKO_CURRENT_WEATHER_ENDPOINT =
  "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc";

export const HKO_WARNING_SUMMARY_ENDPOINT =
  "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc";

export const HKO_LOCAL_FORECAST_ENDPOINT =
  "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw&lang=tc";

export const AQHI_CURRENT_ENDPOINT =
  "https://dashboard.data.gov.hk/api/aqhi-individual?format=json";

export const API_ENDPOINTS = {
  weather: HKO_CURRENT_WEATHER_ENDPOINT,
  warnings: HKO_WARNING_SUMMARY_ENDPOINT,
  forecast: HKO_LOCAL_FORECAST_ENDPOINT,
  aqhi: AQHI_CURRENT_ENDPOINT,
} as const;

export type ApiEndpointName = keyof typeof API_ENDPOINTS;
export type ApiEndpoint = (typeof API_ENDPOINTS)[ApiEndpointName];

export const API_CACHE_TTL_MS = {
  warnings: 60_000,
  weather: 5 * 60_000,
  forecast: 10 * 60_000,
  aqhi: 15 * 60_000,
} as const satisfies Record<ApiEndpointName, number>;

/**
 * Unknown URLs are deliberately not cached. Callers can still opt in by
 * supplying an explicit ttlMs to the JSON client.
 */
export function getDefaultApiCacheTtlMs(url: string): number {
  for (const name of Object.keys(API_ENDPOINTS) as ApiEndpointName[]) {
    if (API_ENDPOINTS[name] === url) {
      return API_CACHE_TTL_MS[name];
    }
  }

  return 0;
}
