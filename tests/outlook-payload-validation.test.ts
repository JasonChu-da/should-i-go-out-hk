import { describe, expect, it } from "vitest";
import { buildOutlookFixture } from "@/e2e/fixtures/outlook";
import { OUTLOOK_NUMERIC_RANGES } from "@/lib/domain/outlook";
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

  it.each([
    ["rainfallMm", OUTLOOK_NUMERIC_RANGES.rainfallMm],
    ["temperatureC", OUTLOOK_NUMERIC_RANGES.temperatureC],
    ["humidityPercent", OUTLOOK_NUMERIC_RANGES.humidityPercent],
    ["uvIndex", OUTLOOK_NUMERIC_RANGES.uvIndex],
  ] as const)(
    "validates the inclusive %s range and unavailable representation",
    (field, range) => {
      const withValue = (value: unknown) => ({
        ...payload,
        weather: {
          ...payload.weather,
          [field]: { ...payload.weather[field], value },
        },
      });

      expect(isOutlookPayload(withValue(range.min))).toBe(true);
      expect(isOutlookPayload(withValue(range.max))).toBe(true);
      expect(isOutlookPayload(withValue(range.min - 0.01))).toBe(false);
      expect(isOutlookPayload(withValue(range.max + 0.01))).toBe(false);
      expect(isOutlookPayload(withValue(String(range.min)))).toBe(false);
      expect(isOutlookPayload(withValue(Number.NaN))).toBe(false);
      expect(isOutlookPayload(withValue(Number.POSITIVE_INFINITY))).toBe(false);
      expect(isOutlookPayload(withValue(null))).toBe(false);
      expect(
        isOutlookPayload({
          ...payload,
          weather: {
            ...payload.weather,
            [field]: {
              ...payload.weather[field],
              status: "missing",
              value: null,
            },
          },
        }),
      ).toBe(true);
      const weatherWithoutMetric = Object.fromEntries(
        Object.entries(payload.weather).filter(([key]) => key !== field),
      );
      expect(
        isOutlookPayload({ ...payload, weather: weatherWithoutMetric }),
      ).toBe(false);
    },
  );

  it("accepts only a consistent official AQHI value, display and risk", () => {
    const withAqhi = (
      value: unknown,
      display: string,
      healthRisk: unknown = payload.aqhi.healthRisk,
    ) => ({
      ...payload,
      aqhi: {
        ...payload.aqhi,
        healthRisk,
        aqhi: {
          ...payload.aqhi.aqhi,
          value: { value, display },
        },
      },
    });

    expect(isOutlookPayload(withAqhi(1, "1", "Low"))).toBe(true);
    expect(isOutlookPayload(withAqhi(11, "10+", "Serious"))).toBe(true);
    expect(isOutlookPayload(withAqhi(7, "7", "Moderate"))).toBe(false);
    expect(isOutlookPayload(withAqhi(7, "7", "Unknown"))).toBe(false);
    expect(isOutlookPayload(withAqhi(0, "0"))).toBe(false);
    expect(isOutlookPayload(withAqhi(12, "12"))).toBe(false);
    expect(isOutlookPayload(withAqhi(Number.NaN, "NaN"))).toBe(false);
    expect(
      isOutlookPayload(withAqhi(Number.POSITIVE_INFINITY, "Infinity")),
    ).toBe(false);
    expect(isOutlookPayload(withAqhi(11, "11"))).toBe(false);
    expect(
      isOutlookPayload({
        ...payload,
        aqhi: {
          ...payload.aqhi,
          healthRisk: null,
          aqhi: { ...payload.aqhi.aqhi, status: "missing", value: null },
        },
      }),
    ).toBe(true);
    expect(
      isOutlookPayload({
        ...payload,
        aqhi: {
          ...payload.aqhi,
          aqhi: { ...payload.aqhi.aqhi, status: "missing", value: null },
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

  it("bounds each half-hour nowcast rainfall value without clamping", () => {
    const forecast = payload.rainfallNowcast.forecast;
    if (!forecast.value) throw new Error("測試 fixture 缺少降雨預報");
    const forecastValue = forecast.value;
    const withFirstRainfall = (rainfallMm: number) => ({
      ...payload,
      rainfallNowcast: {
        ...payload.rainfallNowcast,
        forecast: {
          ...forecast,
          value: {
            ...forecastValue,
            periods: forecastValue.periods.map((period, index) =>
              index === 0 ? { ...period, rainfallMm } : period,
            ),
            firstRainWindow:
              rainfallMm >= 0.5
                ? { firstPeriodIndex: 0, lastPeriodIndex: 0 }
                : null,
          },
        },
      },
    });

    expect(
      isOutlookPayload(
        withFirstRainfall(OUTLOOK_NUMERIC_RANGES.rainfallNowcastMm.min),
      ),
    ).toBe(true);
    expect(
      isOutlookPayload(
        withFirstRainfall(OUTLOOK_NUMERIC_RANGES.rainfallNowcastMm.max),
      ),
    ).toBe(true);
    expect(
      isOutlookPayload(
        withFirstRainfall(
          OUTLOOK_NUMERIC_RANGES.rainfallNowcastMm.max + 0.01,
        ),
      ),
    ).toBe(false);
    expect(isOutlookPayload(withFirstRainfall(Number.NaN))).toBe(false);
    expect(
      isOutlookPayload(withFirstRainfall(Number.POSITIVE_INFINITY)),
    ).toBe(false);
  });
});
