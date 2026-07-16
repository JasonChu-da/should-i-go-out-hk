import { getNearestDistrict, type DistrictRecord } from "./districts";

export interface GeolocationCoordinatesLike {
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeolocationPositionLike {
  readonly coords: GeolocationCoordinatesLike;
}

export interface GeolocationErrorLike {
  readonly code: number;
}

export interface GeolocationOptionsLike {
  readonly enableHighAccuracy?: boolean;
  readonly timeout?: number;
  readonly maximumAge?: number;
}

export interface GeolocationLike {
  getCurrentPosition(
    success: (position: GeolocationPositionLike) => void,
    error?: (error: GeolocationErrorLike) => void,
    options?: GeolocationOptionsLike,
  ): void;
}

export type GeolocationDistrictResult =
  | { readonly status: "success"; readonly district: DistrictRecord }
  | { readonly status: "denied" }
  | { readonly status: "unsupported" }
  | { readonly status: "timeout" }
  | { readonly status: "unavailable" };

export interface DistrictLocationRequestOptions {
  readonly timeoutMs?: number;
  readonly maximumAgeMs?: number;
  readonly enableHighAccuracy?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function browserGeolocation(): GeolocationLike | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  return navigator.geolocation;
}

function normalizedNonNegativeNumber(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/**
 * Makes exactly one browser geolocation request. Precise coordinates are
 * immediately reduced to a canonical district and are never returned, stored,
 * logged, or sent to a server by this module.
 */
export function requestDistrictFromGeolocation(
  geolocation: GeolocationLike | null = browserGeolocation(),
  options: DistrictLocationRequestOptions = {},
): Promise<GeolocationDistrictResult> {
  if (!geolocation) {
    return Promise.resolve({ status: "unsupported" });
  }

  const timeout = normalizedNonNegativeNumber(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
  );
  const maximumAge = normalizedNonNegativeNumber(options.maximumAgeMs, 0);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: GeolocationDistrictResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => finish({ status: "timeout" }), timeout);

    try {
      geolocation.getCurrentPosition(
        (position) => {
          const district = getNearestDistrict(
            position.coords.latitude,
            position.coords.longitude,
          );
          finish(
            district ? { status: "success", district } : { status: "unavailable" },
          );
        },
        (error) => {
          if (error.code === 1) {
            finish({ status: "denied" });
            return;
          }

          if (error.code === 3) {
            finish({ status: "timeout" });
            return;
          }

          finish({ status: "unavailable" });
        },
        {
          enableHighAccuracy: options.enableHighAccuracy ?? false,
          timeout,
          maximumAge,
        },
      );
    } catch {
      finish({ status: "unavailable" });
    }
  });
}
