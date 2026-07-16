import { beforeAll, describe, expect, it } from "vitest";
import type { ApiFetchResult } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type { OutlookPayload } from "@/lib/domain/outlook";
import { buildOutlookPayload } from "@/lib/outlook/aggregate";
import { isOutlookPayload } from "@/lib/validation/outlook";
import aqhi from "@/tests/fixtures/aqhi-live-sanitized.json";
import forecast from "@/tests/fixtures/flw-live-sanitized.json";
import weather from "@/tests/fixtures/rhrread-night-live-sanitized.json";
import warnings from "@/tests/fixtures/warnsum-monsoon-live-sanitized.json";

const NOW = new Date("2026-07-14T12:20:00.000Z");

const success = (data: unknown): ApiFetchResult => ({
  ok: true,
  data,
  retrievedAt: NOW.toISOString(),
  fromCache: false,
});

describe("browser outlook payload boundary", () => {
  let payload: OutlookPayload;

  beforeAll(async () => {
    const responses: Record<string, ApiFetchResult> = {
      [API_ENDPOINTS.weather]: success(weather),
      [API_ENDPOINTS.warnings]: success(warnings),
      [API_ENDPOINTS.forecast]: success(forecast),
      [API_ENDPOINTS.aqhi]: success(aqhi),
    };
    payload = await buildOutlookPayload("central-and-western", {
      fetcher: async (url) => responses[url] as ApiFetchResult,
      now: () => NOW,
    });
  });

  it("accepts the complete normalized server contract", () => {
    expect(isOutlookPayload(payload)).toBe(true);
  });

  it("rejects a truncated response before React rendering", () => {
    expect(isOutlookPayload({ ...payload, weather: undefined })).toBe(false);
    expect(isOutlookPayload({ ...payload, sources: payload.sources.slice(0, 3) })).toBe(false);
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
});
