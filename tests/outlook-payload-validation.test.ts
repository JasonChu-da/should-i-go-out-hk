import { describe, expect, it } from "vitest";
import { buildOutlookFixture } from "@/e2e/fixtures/outlook";
import { isOutlookPayload } from "@/lib/validation/outlook";

describe("browser outlook payload boundary", () => {
  const payload = buildOutlookFixture("central-and-western");

  it("accepts the complete normalized server contract", () => {
    expect(isOutlookPayload(payload)).toBe(true);
  });

  it("rejects a truncated response before React rendering", () => {
    expect(isOutlookPayload({ ...payload, weather: undefined })).toBe(false);
    expect(
      isOutlookPayload({ ...payload, sources: payload.sources.slice(0, 4) }),
    ).toBe(false);
  });

  it("rejects missing warning completeness and wrong metric value types", () => {
    expect(
      isOutlookPayload({
        ...payload,
        warnings: { ...payload.warnings, isSnapshotComplete: undefined },
      }),
    ).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        weather: {
          ...payload.weather,
          conditionIcons: {
            ...payload.weather.conditionIcons,
            value: ["64"],
          },
        },
      }),
    ).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        weather: {
          ...payload.weather,
          temperatureC: { ...payload.weather.temperatureC, value: "30" },
        },
      }),
    ).toBe(false);
  });

  it("requires each of the five unique official sources exactly once", () => {
    expect(
      isOutlookPayload({
        ...payload,
        sources: [
          payload.sources[0],
          payload.sources[0],
          ...payload.sources.slice(2),
        ],
      }),
    ).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        sources: payload.sources.map((source) =>
          source.id === "rainfallNowcast"
            ? { ...source, id: "weather" }
            : source,
        ),
      }),
    ).toBe(false);
  });

  it("requires nowcast status, value and source timestamps to agree", () => {
    expect(
      isOutlookPayload({
        ...payload,
        rainfallNowcast: {
          ...payload.rainfallNowcast,
          forecast: {
            ...payload.rainfallNowcast.forecast,
            status: "failed",
          },
        },
      }),
    ).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        rainfallNowcast: {
          ...payload.rainfallNowcast,
          source: {
            ...payload.rainfallNowcast.source,
            publishedAt: "2026-07-27T05:56:00.000Z",
          },
        },
      }),
    ).toBe(false);
  });

  it("validates four unique contiguous half-hour periods and coverage fields", () => {
    const forecast = payload.rainfallNowcast.forecast;
    if (!forecast.value) throw new Error("測試 fixture 缺少降雨預報");

    expect(
      isOutlookPayload({
        ...payload,
        rainfallNowcast: {
          ...payload.rainfallNowcast,
          forecast: {
            ...forecast,
            value: {
              ...forecast.value,
              periods: forecast.value.periods.slice(0, 3),
            },
          },
        },
      }),
    ).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        rainfallNowcast: {
          ...payload.rainfallNowcast,
          forecast: {
            ...forecast,
            value: {
              ...forecast.value,
              periods: forecast.value.periods.map((period, index) =>
                index === 2
                  ? {
                      ...period,
                      periodStartAt: "2026-07-27T07:00:00.000Z",
                    }
                  : period,
              ),
            },
          },
        },
      }),
    ).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        rainfallNowcast: {
          ...payload.rainfallNowcast,
          forecast: {
            ...forecast,
            value: {
              ...forecast.value,
              remainingCoverageMinutes: 120,
            },
          },
        },
      }),
    ).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        rainfallNowcast: {
          ...payload.rainfallNowcast,
          forecast: {
            ...forecast,
            value: {
              ...forecast.value,
              periods: forecast.value.periods.map((period, index) =>
                index === 0
                  ? {
                      ...period,
                      periodStartAt: "July 27 2026 13:55 GMT+0800",
                    }
                  : period,
              ),
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("rejects negative rainfall and inconsistent partial, window or peak metadata", () => {
    const forecast = payload.rainfallNowcast.forecast;
    if (!forecast.value) throw new Error("測試 fixture 缺少降雨預報");
    const invalidValues = [
      {
        ...forecast.value,
        periods: forecast.value.periods.map((period, index) =>
          index === 0 ? { ...period, rainfallMm: -1 } : period,
        ),
      },
      {
        ...forecast.value,
        periods: forecast.value.periods.map((period, index) =>
          index === 0
            ? { ...period, isPartiallyElapsed: false }
            : period,
        ),
      },
      { ...forecast.value, firstRainWindow: { firstPeriodIndex: 0, lastPeriodIndex: 0 } },
      { ...forecast.value, peakRainPeriodIndex: 2 },
    ];

    for (const value of invalidValues) {
      expect(
        isOutlookPayload({
          ...payload,
          rainfallNowcast: {
            ...payload.rainfallNowcast,
            forecast: { ...forecast, value },
          },
        }),
      ).toBe(false);
    }
  });
});
