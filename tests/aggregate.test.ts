import { describe, expect, it } from "vitest";
import aqhiFixture from "@/tests/fixtures/aqhi-live-sanitized.json";
import forecastFixture from "@/tests/fixtures/flw-live-sanitized.json";
import weatherFixture from "@/tests/fixtures/rhrread-night-live-sanitized.json";
import warningFixture from "@/tests/fixtures/warnsum-monsoon-live-sanitized.json";
import type { ApiFetchFailure, ApiFetchResult } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { buildOutlookPayload } from "@/lib/outlook/aggregate";
import { toScoringInput } from "@/lib/outlook/scoring-input";
import { scoreOutlook } from "@/lib/scoring/score";

const NOW = new Date("2026-07-14T12:20:00.000Z");

function success(data: unknown): ApiFetchResult {
  return { ok: true, data, retrievedAt: NOW.toISOString(), fromCache: false };
}

const unavailable: ApiFetchFailure = {
  ok: false,
  error: { type: "network", message: "暫時未能連線至政府資料服務，請稍後再試。" },
};

function fixtureFetcher(overrides: Partial<Record<string, ApiFetchResult>> = {}) {
  const responses: Record<string, ApiFetchResult> = {
    [API_ENDPOINTS.weather]: success(weatherFixture),
    [API_ENDPOINTS.warnings]: success(warningFixture),
    [API_ENDPOINTS.forecast]: success(forecastFixture),
    [API_ENDPOINTS.aqhi]: success(aqhiFixture),
    ...overrides,
  };
  return async (url: string) => responses[url] ?? unavailable;
}

describe("buildOutlookPayload failure handling", () => {
  it("builds a district payload from sanitized API fixtures", async () => {
    const payload = await buildOutlookPayload("central-and-western", {
      fetcher: fixtureFetcher(),
      now: () => NOW,
    });
    expect(payload.location).toMatchObject({ label: "中西區", localized: true });
    expect(payload.status).not.toBe("error");
    expect(payload.weather.rainfallMm.value).toBe(0);
    expect(payload.sources).toHaveLength(4);
  });

  it("keeps usable sources when one API is unavailable", async () => {
    const payload = await buildOutlookPayload("hong-kong", {
      fetcher: fixtureFetcher({ [API_ENDPOINTS.aqhi]: unavailable }),
      now: () => NOW,
    });
    expect(payload.status).toBe("partial");
    expect(payload.aqhi.aqhi.status).toBe("failed");
    expect(payload.weather.rainfallMm.value).toBe(0);
  });

  it("keeps and scores an official Very high AQHI response", async () => {
    const payload = await buildOutlookPayload("hong-kong", {
      fetcher: fixtureFetcher({
        [API_ENDPOINTS.aqhi]: success([
          {
            station: "Sha Tin",
            aqhi: 9,
            health_risk: "Very high",
            publish_date: "2026-07-14T19:30:00",
          },
        ]),
      }),
      now: () => NOW,
    });
    const result = scoreOutlook(toScoringInput(payload), "exercise");

    expect(payload.aqhi.aqhi).toMatchObject({
      status: "fresh",
      value: { value: 9, display: "9" },
    });
    expect(payload.aqhi.healthRisk).toBe("Very High");
    expect(result.factors).toContainEqual(
      expect.objectContaining({ id: "aqhi" }),
    );
  });

  it("does not produce an overly positive result when warning API fails", async () => {
    const payload = await buildOutlookPayload("hong-kong", {
      fetcher: fixtureFetcher({ [API_ENDPOINTS.warnings]: unavailable }),
      now: () => NOW,
    });
    const result = scoreOutlook(toScoringInput(payload), "general");
    expect(payload.status).toBe("partial");
    expect(result.score).toBeLessThanOrEqual(7);
    expect(result.verdict).not.toBe("suitable");
    expect(result.summary).toContain("未能確認");
  });

  it("caps the result when a malformed warning entry had to be discarded", async () => {
    const malformedWarning = {
      WRAIN: {
        name: "紅色暴雨警告",
        code: "WRAINR",
        // Missing actionCode means the active state cannot be confirmed.
      },
    };
    const payload = await buildOutlookPayload("hong-kong", {
      fetcher: fixtureFetcher({
        [API_ENDPOINTS.warnings]: success(malformedWarning),
      }),
      now: () => NOW,
    });
    const result = scoreOutlook(toScoringInput(payload), "general");

    expect(payload.status).toBe("partial");
    expect(payload.warnings.isSnapshotComplete).toBe(false);
    expect(payload.warnings.items).toEqual([]);
    expect(result.score).toBe(3);
    expect(result.verdict).toBe("avoid");
    expect(result.isLimited).toBe(true);
  });

  it("returns complete error semantics when all APIs are unavailable", async () => {
    const payload = await buildOutlookPayload("hong-kong", {
      fetcher: async () => unavailable,
      now: () => NOW,
    });
    expect(payload.status).toBe("error");
    expect(payload.sources.every((source) => source.status === "unavailable")).toBe(true);
    expect(payload.weather.temperatureC.value).toBeNull();
  });

  it.each([
    [API_ENDPOINTS.weather, [], "weather"],
    [API_ENDPOINTS.warnings, [], "warnings"],
    [API_ENDPOINTS.forecast, [], "forecast"],
    [API_ENDPOINTS.aqhi, {}, "aqhi"],
  ] as const)(
    "isolates a malformed %s root as one unavailable source",
    async (endpoint, malformedRoot, sourceId) => {
      const payload = await buildOutlookPayload("hong-kong", {
        fetcher: fixtureFetcher({ [endpoint]: success(malformedRoot) }),
        now: () => NOW,
      });

      expect(payload.status).toBe("partial");
      expect(payload.sources.find((source) => source.id === sourceId)?.status).toBe(
        "unavailable",
      );
      expect(
        payload.sources
          .filter((source) => source.id !== sourceId)
          .every((source) => source.status === "ok"),
      ).toBe(true);
    },
  );
});
