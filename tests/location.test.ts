import { describe, expect, it, vi } from "vitest";

import {
  DISTRICTS,
  HONG_KONG_WIDE,
  getDistrictById,
  getNearestDistrict,
  haversineDistanceKm,
} from "@/lib/location/districts";
import {
  requestDistrictFromGeolocation,
  type GeolocationLike,
} from "@/lib/location/geolocation";

describe("canonical Hong Kong locations", () => {
  it("contains eighteen unique districts and the explicit territory fallback", () => {
    expect(DISTRICTS).toHaveLength(18);
    expect(new Set(DISTRICTS.map(({ id }) => id)).size).toBe(18);
    expect(new Set(DISTRICTS.map(({ nameTc }) => nameTc)).size).toBe(18);
    expect(HONG_KONG_WIDE).toEqual({
      kind: "territory",
      id: "hong-kong",
      nameTc: "香港整體",
    });
  });

  it("keeps official HKO and EPD mappings in the canonical records", () => {
    expect(getDistrictById("wan-chai")).toMatchObject({
      rainfallPlace: "灣仔",
      aqhiStation: "Central/Western",
    });
    expect(getDistrictById("kowloon-city")?.aqhiStation).toBe("Sham Shui Po");
    expect(getDistrictById("yau-tsim-mong")?.aqhiStation).toBe(
      "Sham Shui Po",
    );
    expect(getDistrictById("wong-tai-sin")?.aqhiStation).toBe("Kwun Tong");
    expect(getDistrictById("islands")?.aqhiStation).toBe("Tung Chung");
    expect(
      DISTRICTS.every((district) => district.temperatureStations.length > 0),
    ).toBe(true);
  });
});

describe("coordinate mapping", () => {
  it("uses haversine distance", () => {
    const central = { latitude: 22.2819, longitude: 114.1449 };
    const shaTin = { latitude: 22.3872, longitude: 114.1953 };
    const forward = haversineDistanceKm(central, shaTin);
    const reverse = haversineDistanceKm(shaTin, central);

    expect(forward).toBeGreaterThan(10);
    expect(forward).toBeLessThan(15);
    expect(reverse).toBeCloseTo(forward, 10);
    expect(haversineDistanceKm(central, central)).toBe(0);
  });

  it.each([
    [22.2819, 114.1449, "central-and-western"],
    [22.3872, 114.1953, "sha-tin"],
    [22.4508, 114.1642, "tai-po"],
    [22.3915, 113.976, "tuen-mun"],
  ] as const)(
    "maps %s, %s to %s using the nearest district centre",
    (latitude, longitude, districtId) => {
      expect(getNearestDistrict(latitude, longitude)?.id).toBe(districtId);
    },
  );

  it("does not fabricate a district for malformed coordinates", () => {
    expect(getNearestDistrict(Number.NaN, 114.1)).toBeNull();
    expect(getNearestDistrict(91, 114.1)).toBeNull();
    expect(getNearestDistrict(22.3, 181)).toBeNull();
  });

  it("does not label clearly overseas coordinates as a Hong Kong district", () => {
    expect(getNearestDistrict(51.5072, -0.1276)).toBeNull();
    expect(getNearestDistrict(22.1987, 113.5439)).toBeNull();
  });
});

describe("browser geolocation wrapper", () => {
  it("returns unsupported without requesting permission when API is absent", async () => {
    await expect(requestDistrictFromGeolocation(null)).resolves.toEqual({
      status: "unsupported",
    });
  });

  it("returns denied as a discriminated result after one request", async () => {
    const getCurrentPosition = vi.fn<GeolocationLike["getCurrentPosition"]>(
      (_success, error) => error?.({ code: 1 }),
    );

    await expect(
      requestDistrictFromGeolocation({ getCurrentPosition }),
    ).resolves.toEqual({ status: "denied" });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("returns timeout as a discriminated result", async () => {
    const geolocation: GeolocationLike = {
      getCurrentPosition: (_success, error) => error?.({ code: 3 }),
    };

    await expect(requestDistrictFromGeolocation(geolocation)).resolves.toEqual({
      status: "timeout",
    });
  });

  it("reduces precise coordinates to a district without returning them", async () => {
    const getCurrentPosition = vi.fn<GeolocationLike["getCurrentPosition"]>(
      (success) =>
        success({ coords: { latitude: 22.3872, longitude: 114.1953 } }),
    );
    const result = await requestDistrictFromGeolocation({ getCurrentPosition });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.district.id).toBe("sha-tin");
    }
    expect(result).not.toHaveProperty("latitude");
    expect(result).not.toHaveProperty("longitude");
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("falls back safely when coordinates are outside the Hong Kong service area", async () => {
    const getCurrentPosition = vi.fn<GeolocationLike["getCurrentPosition"]>(
      (success) =>
        success({ coords: { latitude: 51.5072, longitude: -0.1276 } }),
    );

    await expect(
      requestDistrictFromGeolocation({ getCurrentPosition }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
