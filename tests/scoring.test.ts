import { describe, expect, it } from "vitest";
import type { RainfallNowcastValue } from "@/lib/domain/outlook";
import { scoreOutlook } from "@/lib/scoring/score";
import { WARNING_RULES } from "@/lib/scoring/thresholds";
import type {
  ActivityMode,
  Evidence,
  ScoringInput,
} from "@/lib/scoring/types";

const PUBLISHED_AT = "2026-07-14T12:00:00+08:00";
const GENERATED_AT = "2026-07-14T04:00:00.000Z";
const fresh = <T>(value: T): Evidence<T> => ({ status: "fresh", value, publishedAt: PUBLISHED_AT });
const missing = <T>(): Evidence<T> => ({ status: "missing" });
const stale = <T>(): Evidence<T> => ({ status: "stale", publishedAt: "2026-07-14T01:00:00+08:00" });

function nowcast(
  amounts: readonly [number, number, number, number] = [0, 0, 0, 0],
  updatedAt = "2026-07-14T03:55:00.000Z",
): Evidence<RainfallNowcastValue> {
  const updatedAtMs = Date.parse(updatedAt);
  const generatedAtMs = Date.parse(GENERATED_AT);
  const periods = amounts.map((rainfallMm, index) => {
    const start = updatedAtMs + index * 30 * 60_000;
    const end = start + 30 * 60_000;
    return {
      periodStartAt: new Date(start).toISOString(),
      periodEndAt: new Date(end).toISOString(),
      rainfallMm,
      isPartiallyElapsed: start < generatedAtMs && generatedAtMs < end,
    };
  }) as unknown as RainfallNowcastValue["periods"];
  const rainIndexes = periods
    .map((period, index) => ({ period, index }))
    .filter(
      ({ period }) =>
        Date.parse(period.periodEndAt) > generatedAtMs &&
        period.rainfallMm >= 0.5,
    );
  const firstIndex = rainIndexes[0]?.index;
  let lastIndex = firstIndex;
  if (firstIndex !== undefined) {
    while (
      lastIndex !== undefined &&
      lastIndex + 1 < periods.length &&
      periods[lastIndex + 1].rainfallMm >= 0.5
    ) {
      lastIndex += 1;
    }
  }
  let peakRainPeriodIndex: number | null = null;
  periods.forEach((period, index) => {
    if (
      Date.parse(period.periodEndAt) > generatedAtMs &&
      (peakRainPeriodIndex === null ||
        period.rainfallMm >
          periods[peakRainPeriodIndex].rainfallMm)
    ) {
      peakRainPeriodIndex = index;
    }
  });
  const coverageEndAt = periods[3].periodEndAt;

  return {
    status: "fresh",
    publishedAt: updatedAt,
    value: {
      periods,
      coverageEndAt,
      remainingCoverageMinutes: Math.ceil(
        (Date.parse(coverageEndAt) - generatedAtMs) / 60_000,
      ),
      firstRainWindow:
        firstIndex === undefined || lastIndex === undefined
          ? null
          : {
              firstPeriodIndex: firstIndex,
              lastPeriodIndex: lastIndex,
            },
      peakRainPeriodIndex,
    },
  };
}

function normalInput(): ScoringInput {
  return {
    generatedAt: GENERATED_AT,
    location: { id: "wan-chai", label: "灣仔" },
    rainfallMm: fresh(0),
    rainfallNowcast: nowcast(),
    temperatureC: fresh(25),
    humidityPercent: fresh(60),
    uvIndex: fresh(2),
    aqhi: fresh({ value: 2, display: "2" }),
    forecastDescription: fresh("部分時間有陽光。"),
    warnings: fresh([]),
    warningsConfirmed: true,
  };
}

describe("scoreOutlook", () => {
  it.each<ActivityMode>(["general", "exercise", "laundry"])(
    "normal weather scores 10 in %s mode",
    (mode) => {
      const result = scoreOutlook(normalInput(), mode);
      expect(result.score).toBe(10);
      expect(result.verdict).toBe("suitable");
      expect(result.factors).toEqual([]);
    },
  );

  it.each([
    ["general", 9],
    ["exercise", 8],
    ["laundry", 3],
  ] as const)("applies light rainfall once in %s mode", (mode, expected) => {
    const input = normalInput();
    input.rainfallMm = fresh(1);
    const result = scoreOutlook(input, mode);
    expect(result.score).toBe(expected);
    expect(result.factors.filter((factor) => factor.id === "rain-risk")).toHaveLength(1);
  });

  it.each([
    ["general", 3],
    ["exercise", 2],
    ["laundry", 0],
  ] as const)("handles heavy rainfall in %s mode", (mode, expected) => {
    const input = normalInput();
    input.rainfallMm = fresh(15);
    expect(scoreOutlook(input, mode).score).toBe(expected);
  });

  it("penalizes very hot weather more for exercise", () => {
    const input = normalInput();
    input.temperatureC = fresh(35);
    expect(scoreOutlook(input, "general").score).toBe(5);
    expect(scoreOutlook(input, "exercise").score).toBe(2);
    expect(scoreOutlook(input, "laundry").score).toBe(10);
  });

  it("adds the high-heat and high-humidity interaction only when both are fresh", () => {
    const input = normalInput();
    input.temperatureC = fresh(33);
    input.humidityPercent = fresh(85);
    expect(scoreOutlook(input, "general").score).toBe(6);
    expect(scoreOutlook(input, "exercise").score).toBe(0);

    input.humidityPercent = stale();
    const staleHumidity = scoreOutlook(input, "general");
    expect(staleHumidity.score).toBe(7);
    expect(staleHumidity.ignoredFactors).toContainEqual(
      expect.objectContaining({ id: "humidity", status: "stale" }),
    );
  });

  it.each([
    ["missing", missing<number>()],
    ["invalid", { status: "malformed", reason: "濕度數值超出合理範圍。" }],
  ] as const)(
    "lists %s humidity as ignored for high heat in general mode",
    (_case, humidityPercent) => {
      const input = normalInput();
      input.temperatureC = fresh(33);
      input.humidityPercent = humidityPercent;

      const result = scoreOutlook(input, "general");

      expect(result.score).toBe(7);
      expect(result.ignoredFactors).toContainEqual(
        expect.objectContaining({ id: "humidity" }),
      );
    },
  );

  it("keeps normal high-temperature scoring unchanged with valid humidity", () => {
    const input = normalInput();
    input.temperatureC = fresh(33);
    input.humidityPercent = fresh(60);

    const result = scoreOutlook(input, "general");

    expect(result.score).toBe(7);
    expect(result.ignoredFactors).not.toContainEqual(
      expect.objectContaining({ id: "humidity" }),
    );
  });

  it("penalizes high UV more for exercise", () => {
    const input = normalInput();
    input.uvIndex = fresh(8);
    expect(scoreOutlook(input, "general").score).toBe(8);
    expect(scoreOutlook(input, "exercise").score).toBe(6);
    expect(scoreOutlook(input, "laundry").score).toBe(10);
  });

  it.each<ActivityMode>(["general", "exercise", "laundry"])(
    "does not treat unavailable night-time UV as a risk or missing-data cap in %s mode",
    (mode) => {
      const input = normalInput();
      input.uvIndex = { status: "notApplicable" };

      const result = scoreOutlook(input, mode);

      expect(result.score).toBe(10);
      expect(result.verdict).toBe("suitable");
      expect(result.ignoredFactors).not.toContainEqual(
        expect.objectContaining({ id: "uv" }),
      );
    },
  );

  it("penalizes high AQHI more for exercise and not for laundry", () => {
    const input = normalInput();
    input.aqhi = fresh({ value: 8, display: "8" });
    expect(scoreOutlook(input, "general").score).toBe(7);
    expect(scoreOutlook(input, "exercise").score).toBe(3);
    expect(scoreOutlook(input, "laundry").score).toBe(10);
  });

  it.each([
    ["general", 6, "prepare"],
    ["exercise", 3, "avoid"],
    ["laundry", 3, "avoid"],
  ] as const)(
    "gives a cautious thunderstorm result in %s mode",
    (mode, expectedScore, expectedVerdict) => {
      const input = normalInput();
      input.warnings = fresh([
        { family: "WTS", code: "WTS", name: "雷暴警告" },
      ]);

      const result = scoreOutlook(input, mode);

      expect(result.score).toBe(expectedScore);
      expect(result.verdict).toBe(expectedVerdict);
      expect(result.summary).toContain("雷暴警告現正生效");
      expect(result.recommendations[0]).toContain("遠離空曠地方");
    },
  );

  it("uses only fresh AQHI data", () => {
    const input = normalInput();
    input.aqhi = stale();
    const result = scoreOutlook(input, "exercise");
    expect(result.score).toBe(7);
    expect(result.verdict).toBe("prepare");
    expect(result.ignoredFactors).toContainEqual(expect.objectContaining({ id: "aqhi", status: "stale" }));
  });

  it("uses a limited, tested forecast phrase list only for laundry", () => {
    const showers = normalInput();
    showers.forecastDescription = fresh("大致多雲，有幾陣驟雨。");
    expect(scoreOutlook(showers, "laundry").score).toBe(7);
    expect(scoreOutlook(showers, "general").score).toBe(10);

    const heavy = normalInput();
    heavy.forecastDescription = fresh("部分地區雨勢較大。\n");
    expect(scoreOutlook(heavy, "laundry").score).toBe(3);

    const negative = normalInput();
    negative.forecastDescription = fresh("預料沒有雨。\n");
    expect(scoreOutlook(negative, "laundry").score).toBe(10);
  });

  it.each([
    [0.49, "general", 10],
    [0.5, "general", 9],
    [0.5, "exercise", 8],
    [0.5, "laundry", 3],
    [2.5, "general", 8],
    [2.5, "exercise", 7],
    [2.5, "laundry", 2],
    [5, "general", 8],
    [5, "exercise", 7],
    [5, "laundry", 2],
    [5.01, "general", 7],
    [5.01, "exercise", 5],
    [5.01, "laundry", 1],
  ] as const)(
    "uses the within-hour nowcast boundary %s mm in %s mode",
    (rainfallMm, mode, expectedScore) => {
      const input = normalInput();
      input.rainfallNowcast = nowcast([rainfallMm, 0, 0, 0]);

      expect(scoreOutlook(input, mode).score).toBe(expectedScore);
    },
  );

  it.each([
    [0.5, "general", 10],
    [0.5, "exercise", 9],
    [0.5, "laundry", 5],
    [2.5, "general", 9],
    [2.5, "exercise", 8],
    [2.5, "laundry", 4],
    [5, "general", 9],
    [5, "exercise", 8],
    [5, "laundry", 4],
    [5.01, "general", 8],
    [5.01, "exercise", 7],
    [5.01, "laundry", 3],
  ] as const)(
    "uses the later nowcast boundary %s mm in %s mode",
    (rainfallMm, mode, expectedScore) => {
      const input = normalInput();
      input.rainfallNowcast = nowcast([0, 0, 0, rainfallMm]);

      expect(scoreOutlook(input, mode).score).toBe(expectedScore);
    },
  );

  it("uses only the highest rain-risk penalty instead of stacking four periods or sources", () => {
    const input = normalInput();
    input.rainfallMm = fresh(1);
    input.rainfallNowcast = nowcast([5.1, 5.1, 5.1, 5.1]);
    input.forecastDescription = fresh("有驟雨，部分地區雨勢較大。");

    const result = scoreOutlook(input, "laundry");

    expect(result.score).toBe(1);
    expect(
      result.factors.filter((factor) => factor.id === "rain-risk"),
    ).toHaveLength(1);
    expect(result.factors.find((factor) => factor.id === "rain-risk")).toMatchObject({
      penalty: 9,
      label: "短期降雨風險上升",
    });
    expect(
      result.factors.find((factor) => factor.id === "rain-risk")?.detail,
    ).toContain("過去一小時亦錄得 1 毫米，只作輔助證據");
    expect(
      result.factors.find((factor) => factor.id === "rain-risk")?.detail,
    ).toContain("本港預報亦提及較大雨勢，只作輔助證據");
  });

  it("describes the first rain window and separately explains a later scoring driver", () => {
    const input = normalInput();
    input.rainfallNowcast = nowcast([0.7, 0, 0, 8]);

    const result = scoreOutlook(input, "general");
    const rainRisk = result.factors.find(
      (factor) => factor.id === "rain-risk",
    );

    expect(result.score).toBe(8);
    expect(rainRisk?.detail).toContain(
      "灣仔目前這個半小時預報時段有降雨訊號",
    );
    expect(rainRisk?.detail).toContain("主要扣分時段為約 90–120 分鐘內");
    expect(rainRisk?.detail).toContain("8 毫米");
  });

  it("breaks equal rain penalties by explicit time, proximity, then nowcast source", () => {
    const input = normalInput();
    input.rainfallMm = fresh(1);
    input.rainfallNowcast = nowcast([0.5, 2, 0, 5]);
    input.forecastDescription = fresh("部分地區雨勢較大。");

    const result = scoreOutlook(input, "laundry");
    const rainRisk = result.factors.find(
      (factor) => factor.id === "rain-risk",
    );

    expect(rainRisk).toMatchObject({
      penalty: 7,
      label: "短期降雨風險上升",
    });
    expect(rainRisk?.detail).toContain(
      "完整半小時的累計預測，部分時段已經過去",
    );
  });

  it.each(["failed", "stale", "malformed"] as const)(
    "does not mark the score limited when only additive nowcast is %s",
    (status) => {
      const input = normalInput();
      input.rainfallNowcast = {
        status,
        reason: "未能取得未來降雨預報。",
      };

      const result = scoreOutlook(input, "general");

      expect(result.score).toBe(10);
      expect(result.isLimited).toBe(false);
      expect(result.ignoredFactors).not.toContainEqual(
        expect.objectContaining({ id: "rainfallNowcast" }),
      );
    },
  );

  it("uses Hong Kong-wide wording without implying rain everywhere", () => {
    const input = normalInput();
    input.location = { id: "hong-kong", label: "香港整體" };
    input.rainfallNowcast = nowcast([0.5, 0, 0, 0]);

    expect(scoreOutlook(input, "general").summary).toContain(
      "香港部分地區",
    );
  });

  it.each(["WRAINB", "TC8NE", "TC9", "TC10", "WTMW"])(
    "caps severe warning %s at 1",
    (code) => {
      const input = normalInput();
      input.warnings = fresh([{ family: code.startsWith("TC") ? "WTCSGNL" : code, code, name: "嚴重警告" }]);
      const result = scoreOutlook(input, "general");
      expect(result.score).toBe(1);
      expect(result.verdict).toBe("avoid");
      expect(result.summary).toContain("最高為 1");
    },
  );

  it("deduplicates one warning family and keeps the more severe warning", () => {
    const input = normalInput();
    input.warnings = fresh([
      { family: "WRAIN", code: "WRAINA", name: "黃色暴雨警告" },
      { family: "WRAIN", code: "WRAINB", name: "黑色暴雨警告" },
    ]);
    const result = scoreOutlook(input, "general");
    expect(result.score).toBe(1);
    expect(result.factors.filter((factor) => factor.id.startsWith("warning-"))).toHaveLength(1);
  });

  it("ignores cancelled warnings", () => {
    const input = normalInput();
    input.warnings = fresh([
      { family: "WRAIN", code: "WRAINB", name: "黑色暴雨警告", actionCode: "CANCEL" },
    ]);
    expect(scoreOutlook(input, "general").score).toBe(10);
  });

  it("caps the score and leads with uncertainty when warning data is unavailable", () => {
    const input = normalInput();
    input.warnings = { status: "failed", reason: "警告 API 暫時無法連線。" };
    const result = scoreOutlook(input, "general");
    expect(result.score).toBe(7);
    expect(result.verdict).toBe("prepare");
    expect(result.summary).toContain("未能確認");
    expect(result.recommendations[0]).toContain("香港天文台");
  });

  it("uses a conservative cap for an unknown active warning", () => {
    const input = normalInput();
    input.warnings = fresh([{ family: "NEW", code: "WNEW", name: "新增警告" }]);
    const result = scoreOutlook(input, "general");
    expect(result.score).toBe(3);
    expect(result.verdict).toBe("avoid");
  });

  it("does not crash or invent a value when temperature is missing", () => {
    const input = normalInput();
    input.temperatureC = missing();
    const result = scoreOutlook(input, "general");
    expect(result.score).toBe(7);
    expect(result.verdict).toBe("prepare");
    expect(result.isLimited).toBe(true);
    expect(result.ignoredFactors).toContainEqual(expect.objectContaining({ id: "temperature" }));
  });

  it("returns no score when only the additive nowcast source is fresh", () => {
    const input: ScoringInput = {
      generatedAt: GENERATED_AT,
      location: { id: "hong-kong", label: "香港整體" },
      rainfallMm: missing(),
      rainfallNowcast: nowcast([1, 0, 0, 0]),
      temperatureC: missing(),
      humidityPercent: missing(),
      uvIndex: missing(),
      aqhi: missing(),
      forecastDescription: missing(),
      warnings: fresh([]),
      warningsConfirmed: true,
    };
    const result = scoreOutlook(input, "laundry");
    expect(result.score).toBeNull();
    expect(result.verdict).toBe("unavailable");
  });

  it("clamps multiple deductions at zero and returns at most three actions", () => {
    const input = normalInput();
    input.rainfallMm = fresh(30);
    input.temperatureC = fresh(35);
    input.humidityPercent = fresh(95);
    input.uvIndex = fresh(11);
    input.aqhi = fresh({ value: 11, display: "10+" });
    input.warnings = fresh([{ family: "WTS", code: "WTS", name: "雷暴警告" }]);
    const result = scoreOutlook(input, "exercise");
    expect(result.score).toBe(0);
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
    expect(result.factors.every((factor) => factor.detail.length > 0)).toBe(true);
  });

  it("uses a conservative cap when a warning entry was discarded", () => {
    const input = normalInput();
    input.warningsConfirmed = false;
    const result = scoreOutlook(input, "general");

    expect(result.score).toBe(3);
    expect(result.verdict).toBe("avoid");
    expect(result.summary).toContain("格式異常");
  });

  it("keeps a confirmed severe warning stricter than an incomplete snapshot cap", () => {
    const input = normalInput();
    input.warningsConfirmed = false;
    input.warnings = fresh([
      { family: "WRAIN", code: "WRAINB", name: "黑色暴雨警告" },
    ]);

    expect(scoreOutlook(input, "general").score).toBe(1);
  });

  it.each([
    [2.49, 9],
    [2.5, 7],
    [10, 3],
    [30, 1],
  ])("uses one rainfall bucket at boundary %s", (rainfall, expected) => {
    const input = normalInput();
    input.rainfallMm = fresh(rainfall);
    expect(scoreOutlook(input, "general").score).toBe(expected);
  });

  it.each([
    [27.9, 10],
    [28, 9],
    [30, 9],
    [33, 7],
    [35, 5],
  ])("uses the general temperature boundary at %s°C", (temperature, expected) => {
    const input = normalInput();
    input.temperatureC = fresh(temperature);
    expect(scoreOutlook(input, "general").score).toBe(expected);
  });

  it.each([
    [69.9, 10, 10],
    [70, 10, 9],
    [85, 8, 7],
    [95, 7, 5],
  ])("uses the humidity boundary at %s%%", (humidity, exercise, laundry) => {
    const input = normalInput();
    input.humidityPercent = fresh(humidity);
    expect(scoreOutlook(input, "exercise").score).toBe(exercise);
    expect(scoreOutlook(input, "laundry").score).toBe(laundry);
  });

  it.each([
    [2.9, 10, 10],
    [3, 10, 9],
    [6, 9, 8],
    [8, 8, 6],
    [11, 7, 4],
  ])("uses the UV boundary at %s", (uv, general, exercise) => {
    const input = normalInput();
    input.uvIndex = fresh(uv);
    expect(scoreOutlook(input, "general").score).toBe(general);
    expect(scoreOutlook(input, "exercise").score).toBe(exercise);
  });

  it.each([
    [3, 10, 10],
    [4, 10, 9],
    [7, 9, 7],
    [8, 7, 3],
    [11, 5, 0],
  ])("uses the AQHI boundary at %s", (aqhi, general, exercise) => {
    const input = normalInput();
    input.aqhi = fresh({ value: aqhi, display: String(aqhi) });
    expect(scoreOutlook(input, "general").score).toBe(general);
    expect(scoreOutlook(input, "exercise").score).toBe(exercise);
  });

  it.each(
    Object.entries(WARNING_RULES).flatMap(([code, rule]) =>
      (["general", "exercise", "laundry"] as const).map((mode) => [
        code,
        mode,
        Math.min(10 - rule.penalties[mode], rule.cap ?? 10),
      ] as const),
    ),
  )("applies known warning %s in %s mode", (code, mode, expected) => {
    const input = normalInput();
    input.warnings = fresh([{ family: code, code, name: "測試警告" }]);
    expect(scoreOutlook(input, mode).score).toBe(expected);
  });
});
