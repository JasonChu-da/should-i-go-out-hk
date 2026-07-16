import { describe, expect, it } from "vitest";

import {
  FRESHNESS_THRESHOLDS_MS,
  assessFreshness,
  normalizeHktTimestamp,
  parseHktTimestamp,
} from "@/lib/freshness";

describe("freshness thresholds", () => {
  it("centralizes every required source limit", () => {
    expect(FRESHNESS_THRESHOLDS_MS).toEqual({
      weather: 90 * 60 * 1_000,
      aqhi: 3 * 60 * 60 * 1_000,
      warnings: 30 * 60 * 1_000,
      forecast: 12 * 60 * 60 * 1_000,
      futureSkew: 5 * 60 * 1_000,
    });
  });
});

describe("assessFreshness", () => {
  const now = Date.parse("2026-07-14T12:00:00Z");
  const maxAge = FRESHNESS_THRESHOLDS_MS.weather;

  it("keeps an observation fresh at the exact maximum-age boundary", () => {
    expect(assessFreshness(now - maxAge, now, maxAge)).toBe("fresh");
  });

  it("marks an observation stale immediately after the age boundary", () => {
    expect(assessFreshness(now - maxAge - 1, now, maxAge)).toBe("stale");
  });

  it("accepts the exact future clock-skew boundary", () => {
    expect(
      assessFreshness(
        now + FRESHNESS_THRESHOLDS_MS.futureSkew,
        now,
        maxAge,
      ),
    ).toBe("fresh");
  });

  it("marks a timestamp beyond the clock-skew allowance as future", () => {
    expect(
      assessFreshness(
        now + FRESHNESS_THRESHOLDS_MS.futureSkew + 1,
        now,
        maxAge,
      ),
    ).toBe("future");
  });

  it.each([
    [null, now, maxAge],
    ["not-a-time", now, maxAge],
    [now, "not-a-time", maxAge],
    [now, now, -1],
    [now, now, Number.NaN],
  ])("returns invalid for an invalid input set", (timestamp, current, limit) => {
    expect(assessFreshness(timestamp, current, limit)).toBe("invalid");
  });
});

describe("Hong Kong timestamp parsing", () => {
  it("explicitly appends +08:00 to an offset-free AQHI timestamp", () => {
    expect(normalizeHktTimestamp("2026-07-14T19:30:00")).toBe(
      "2026-07-14T19:30:00+08:00",
    );
    expect(parseHktTimestamp("2026-07-14T19:30:00")?.toISOString()).toBe(
      "2026-07-14T11:30:00.000Z",
    );
  });

  it("preserves an explicit offset instead of applying HKT twice", () => {
    expect(parseHktTimestamp("2026-07-14T19:30:00Z")?.toISOString()).toBe(
      "2026-07-14T19:30:00.000Z",
    );
    expect(parseHktTimestamp("2026-07-14T19:30:00+0800")?.toISOString()).toBe(
      "2026-07-14T11:30:00.000Z",
    );
  });

  it.each(["", "not-a-time", "2026-02-30T19:30:00", "2026-07-14T25:00:00"])(
    "rejects invalid timestamp %s",
    (timestamp) => {
      expect(parseHktTimestamp(timestamp)).toBeNull();
    },
  );
});
