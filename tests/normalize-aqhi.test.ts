import { describe, expect, it } from "vitest";

import { AQHI_CURRENT_ENDPOINT } from "@/lib/api/endpoints";
import { normalizeAqhi } from "@/lib/normalization/aqhi";
import type {
  AqhiHealthRisk,
  AqhiResponse,
  AqhiValue,
} from "@/lib/validation/aqhi";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const RETRIEVED_AT = "2026-07-14T12:01:00.000Z";
const FRESH_HKT = "2026-07-14T19:30:00";

function reading(
  station: string,
  aqhi: AqhiValue,
  publishDate = FRESH_HKT,
  healthRisk: AqhiHealthRisk = "Low",
): AqhiResponse[number] {
  return {
    station,
    aqhi,
    health_risk: healthRisk,
    publish_date: publishDate,
  };
}

describe("normalizeAqhi", () => {
  it.each([
    [6, 6, "6"],
    ["7", 7, "7"],
    ["10+", 11, "10+"],
  ] as const)(
    "normalizes AQHI %s to its numeric score and display text",
    (input, expectedValue, expectedDisplay) => {
      const result = normalizeAqhi(
        [reading("Central/Western", input, FRESH_HKT, "High")],
        "central-and-western",
        RETRIEVED_AT,
        NOW,
      );

      expect(result.aqhi).toMatchObject({
        status: "fresh",
        value: { value: expectedValue, display: expectedDisplay },
        place: "中西區監測站",
        rawPublishedAt: FRESH_HKT,
        publishedAt: "2026-07-14T11:30:00.000Z",
      });
      expect(result.healthRisk).toBe("High");
      expect(result.source).toMatchObject({
        id: "aqhi",
        label: "環境保護署空氣質素健康指數",
        url: AQHI_CURRENT_ENDPOINT,
        status: "ok",
        retrievedAt: RETRIEVED_AT,
        rawPublishedAt: FRESH_HKT,
        publishedAt: "2026-07-14T11:30:00.000Z",
      });
    },
  );

  it("uses the district's official AQHI station mapping", () => {
    const result = normalizeAqhi(
      [
        reading("Sham Shui Po", "3"),
        reading("Central/Western", "9"),
        reading("Mong Kok", "10+"),
      ],
      "yau-tsim-mong",
      RETRIEVED_AT,
      NOW,
    );

    expect(result.aqhi).toMatchObject({
      status: "fresh",
      value: { value: 3, display: "3" },
      place: "深水埗監測站",
    });
  });

  it("selects the highest fresh general station in Hong Kong-wide mode", () => {
    const result = normalizeAqhi(
      [
        reading("Central/Western", 4),
        reading("Tung Chung", 8, FRESH_HKT, "High"),
        reading("Yuen Long", 10, "2026-07-14T15:00:00", "Very High"),
      ],
      "hong-kong",
      RETRIEVED_AT,
      NOW,
    );

    expect(result.aqhi).toMatchObject({
      status: "fresh",
      value: { value: 8, display: "8" },
      place: "全港一般監測站最高（東涌）",
    });
    expect(result.healthRisk).toBe("High");
  });

  it("always excludes the three roadside stations", () => {
    const result = normalizeAqhi(
      [
        reading("Causeway Bay", "10+", FRESH_HKT, "Serious"),
        reading("Central", "10+", FRESH_HKT, "Serious"),
        reading("Mong Kok", "10+", FRESH_HKT, "Serious"),
        reading("Eastern", 2),
      ],
      "hong-kong",
      RETRIEVED_AT,
      NOW,
    );

    expect(result.aqhi).toMatchObject({
      status: "fresh",
      value: { value: 2, display: "2" },
      place: "全港一般監測站最高（東區）",
    });
  });

  it("falls back to the highest stale general reading when none are fresh", () => {
    const result = normalizeAqhi(
      [
        reading("Eastern", 4, "2026-07-14T15:30:00", "Moderate"),
        reading("Tai Po", "9", "2026-07-14T15:00:00", "Very High"),
      ],
      "hong-kong",
      RETRIEVED_AT,
      NOW,
    );

    expect(result.aqhi).toMatchObject({
      status: "stale",
      value: { value: 9, display: "9" },
      place: "全港一般監測站最高（大埔）",
      rawPublishedAt: "2026-07-14T15:00:00",
      publishedAt: "2026-07-14T07:00:00.000Z",
    });
    expect(result.healthRisk).toBe("Very High");
    expect(result.source.status).toBe("stale");
  });

  it("returns missing when the district's mapped station is absent", () => {
    const result = normalizeAqhi(
      [reading("Eastern", 5)],
      "sha-tin",
      RETRIEVED_AT,
      NOW,
    );

    expect(result.aqhi).toMatchObject({
      status: "missing",
      value: null,
      place: "沙田監測站",
      publishedAt: null,
      rawPublishedAt: null,
    });
    expect(result.healthRisk).toBeNull();
    expect(result.source.status).toBe("unavailable");
    expect(result.source.issues).toHaveLength(1);
  });

  it("preserves an invalid raw timestamp while marking the metric malformed", () => {
    const result = normalizeAqhi(
      [reading("Sha Tin", 5, "not-a-time", "Moderate")],
      "sha-tin",
      RETRIEVED_AT,
      NOW,
    );

    expect(result.aqhi).toMatchObject({
      status: "malformed",
      value: null,
      place: "沙田監測站",
      publishedAt: null,
      rawPublishedAt: "not-a-time",
    });
    expect(result.healthRisk).toBeNull();
    expect(result.source).toMatchObject({
      status: "unavailable",
      publishedAt: null,
      rawPublishedAt: "not-a-time",
    });
    expect(result.source.issues).toHaveLength(1);
  });
});
