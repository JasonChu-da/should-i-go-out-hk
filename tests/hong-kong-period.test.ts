import { describe, expect, it } from "vitest";

import {
  getHongKongSolarTimes,
  hongKongWeatherPeriod,
} from "@/lib/weather-scene/hong-kong-period";

describe("hongKongWeatherPeriod", () => {
  it.each([
    ["夏至白天", "2026-06-21T04:00:00.000Z", "day"],
    ["夏至黃昏", "2026-06-21T10:45:00.000Z", "dusk"],
    ["夏至黑夜", "2026-06-21T12:00:00.000Z", "night"],
    ["冬至白天", "2026-12-21T04:00:00.000Z", "day"],
    ["冬至黃昏", "2026-12-21T09:30:00.000Z", "dusk"],
    ["冬至黑夜", "2026-12-21T11:00:00.000Z", "night"],
    ["一般日白天", "2026-03-20T04:00:00.000Z", "day"],
    ["一般日黃昏", "2026-03-20T10:00:00.000Z", "dusk"],
    ["一般日黑夜", "2026-03-20T11:30:00.000Z", "night"],
  ])("classifies %s", (_label, timestamp, expected) => {
    expect(hongKongWeatherPeriod(timestamp)).toBe(expected);
  });

  it("uses sunrise, sunset minus 45 minutes, and civil dusk as boundaries", () => {
    const times = getHongKongSolarTimes(new Date("2026-07-16T04:00:00.000Z"));
    expect(times).not.toBeNull();
    if (times === null) return;
    const duskStarts = times.sunset.getTime() - 45 * 60_000;

    expect(hongKongWeatherPeriod(new Date(times.sunrise.getTime() - 1).toISOString())).toBe("night");
    expect(hongKongWeatherPeriod(times.sunrise.toISOString())).toBe("day");
    expect(hongKongWeatherPeriod(new Date(duskStarts - 1).toISOString())).toBe("day");
    expect(hongKongWeatherPeriod(new Date(duskStarts).toISOString())).toBe("dusk");
    expect(hongKongWeatherPeriod(times.civilDusk.toISOString())).toBe("dusk");
    expect(hongKongWeatherPeriod(new Date(times.civilDusk.getTime() + 1).toISOString())).toBe("night");
  });

  it("returns null for an invalid timestamp", () => {
    expect(hongKongWeatherPeriod("not-a-date")).toBeNull();
  });
});
