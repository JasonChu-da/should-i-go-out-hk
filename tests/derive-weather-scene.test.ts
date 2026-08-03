import { describe, expect, it } from "vitest";

import type {
  MetricStatus,
  NormalizedMetric,
  NormalizedWarning,
  RainfallNowcastValue,
  SourceStatus,
} from "@/lib/domain/outlook";
import {
  deriveWeatherScene,
  getWeatherSceneVisualKey,
  type WeatherSceneData,
} from "@/lib/weather-scene/derive-weather-scene";

const DAY = "2026-07-16T05:00:00.000Z";
const NIGHT = "2026-07-16T13:00:00.000Z";

function metric<T>(
  value: T | null,
  status: MetricStatus = "fresh",
): NormalizedMetric<T> {
  return {
    status,
    value,
    label: "測試資料",
    place: "中西區",
    publishedAt: "2026-07-16T04:55:00.000Z",
    rawPublishedAt: "2026-07-16T12:55:00+08:00",
    message: status === "fresh" ? "資料新鮮。" : "資料不可用。",
  };
}

function warning(
  code: string,
  name = code,
  actionCode = "ISSUE",
): NormalizedWarning {
  return {
    family: code.startsWith("TC") ? "WTCSGNL" : code,
    code,
    name,
    actionCode,
    type: null,
    issueTime: null,
    updateTime: null,
    expireTime: null,
  };
}

function nowcastValue(
  amounts: readonly [number, number, number, number] = [0, 0, 0, 0],
  startAt = "2026-07-16T04:00:00.000Z",
): RainfallNowcastValue {
  const firstStartMs = Date.parse(startAt);
  const periods = amounts.map((rainfallMm, index) => {
    const periodStartAt = new Date(
      firstStartMs + index * 30 * 60_000,
    ).toISOString();
    return {
      periodStartAt,
      periodEndAt: new Date(
        Date.parse(periodStartAt) + 30 * 60_000,
      ).toISOString(),
      rainfallMm,
      isPartiallyElapsed: false,
    };
  }) as unknown as RainfallNowcastValue["periods"];

  return {
    periods,
    coverageEndAt: periods[3].periodEndAt,
    remainingCoverageMinutes: 120,
    firstRainWindow: null,
    peakRainPeriodIndex: null,
  };
}

function sceneData({
  icons = [50],
  iconStatus = "fresh",
  rainfall = 0,
  rainfallStatus = "fresh",
  temperature = 28,
  temperatureStatus = "fresh",
  warnings = [],
  warningStatus = "ok",
  warningComplete = true,
  nowcastAmounts = [0, 0, 0, 0],
  nowcastStatus = "fresh",
  nowcastStartAt = "2026-07-16T04:00:00.000Z",
  generatedAt = DAY,
}: {
  icons?: number[] | null;
  iconStatus?: MetricStatus;
  rainfall?: number | null;
  rainfallStatus?: MetricStatus;
  temperature?: number | null;
  temperatureStatus?: MetricStatus;
  warnings?: NormalizedWarning[];
  warningStatus?: SourceStatus;
  warningComplete?: boolean;
  nowcastAmounts?: readonly [number, number, number, number];
  nowcastStatus?: MetricStatus;
  nowcastStartAt?: string;
  generatedAt?: string;
} = {}): WeatherSceneData {
  return {
    status: "ok",
    generatedAt,
    weather: {
      conditionIcons: metric(icons, iconStatus),
      rainfallMm: metric(rainfall, rainfallStatus),
      temperatureC: metric(temperature, temperatureStatus),
    },
    warnings: {
      items: warnings,
      isSnapshotComplete: warningComplete,
      source: { status: warningStatus },
    },
    rainfallNowcast: {
      forecast: metric(nowcastValue(nowcastAmounts, nowcastStartAt), nowcastStatus),
    },
  };
}

describe("deriveWeatherScene", () => {
  it.each(["day", "dusk", "night"] as const)(
    "keeps neutral semantics while using the requested fallback period (%s)",
    (fallbackPeriod) => {
      expect(deriveWeatherScene(null, fallbackPeriod)).toMatchObject({
        scene: "neutral",
        period: fallbackPeriod,
        animationEnabled: false,
      });
    },
  );

  it("uses the fallback period when payload time is invalid", () => {
    expect(
      deriveWeatherScene(sceneData({ generatedAt: "not-a-date" }), "night"),
    ).toMatchObject({
      scene: "neutral",
      period: "night",
      animationEnabled: false,
    });
  });

  it("prefers the valid payload period over the SSR fallback", () => {
    expect(deriveWeatherScene(sceneData({ generatedAt: NIGHT }), "day")).toMatchObject({
      scene: "clear",
      period: "night",
    });
  });

  it.each([
    { label: "晴朗", icons: [50], expected: "clear" },
    { label: "多雲", icons: [60], expected: "cloudy" },
    { label: "陰天／密雲", icons: [61], expected: "overcast" },
  ])("由官方圖示判斷$label場景", ({ icons, expected }) => {
    expect(deriveWeatherScene(sceneData({ icons }))).toMatchObject({
      scene: expected,
      period: "day",
      precipitation: "none",
      animationEnabled: true,
    });
  });

  it("以地區小雨量選擇 light rain", () => {
    expect(deriveWeatherScene(sceneData({ rainfall: 1.2 }))).toMatchObject({
      scene: "rain",
      precipitation: "light",
      severity: "normal",
    });
  });

  it("天氣圖示過時時仍使用新鮮的地區雨量", () => {
    expect(
      deriveWeatherScene(sceneData({ icons: [62], iconStatus: "stale", rainfall: 1.2 })),
    ).toMatchObject({
      scene: "rain",
      precipitation: "light",
    });
  });

  it("新鮮的降雨圖示不受過時地區雨量阻擋", () => {
    expect(
      deriveWeatherScene(
        sceneData({ icons: [62], rainfall: 0, rainfallStatus: "stale" }),
      ),
    ).toMatchObject({
      scene: "rain",
      precipitation: "light",
    });
  });

  it("新鮮的雷暴圖示不受過時地區雨量阻擋", () => {
    expect(
      deriveWeatherScene(
        sceneData({ icons: [65], rainfall: 0, rainfallStatus: "stale" }),
      ),
    ).toMatchObject({ scene: "storm", precipitation: "heavy" });
  });

  it("過時地區雨量不會覆蓋新鮮晴天圖示", () => {
    expect(
      deriveWeatherScene(
        sceneData({ icons: [50], rainfall: 18, rainfallStatus: "stale" }),
      ),
    ).toMatchObject({ scene: "clear", precipitation: "none" });
  });

  it("以地區大雨量選擇 heavy rain", () => {
    expect(deriveWeatherScene(sceneData({ rainfall: 18 }))).toMatchObject({
      scene: "rain",
      precipitation: "heavy",
      severity: "caution",
    });
  });

  it("雷暴警告優先於晴朗圖示", () => {
    expect(
      deriveWeatherScene(sceneData({ warnings: [warning("WTS", "雷暴警告")] })),
    ).toMatchObject({
      scene: "storm",
      precipitation: "medium",
      severity: "danger",
    });
  });

  it("警告 snapshot 不完整時仍保留已確認的雷暴警告", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          warnings: [warning("WTS", "雷暴警告")],
          warningComplete: false,
        }),
      ),
    ).toMatchObject({ scene: "storm" });
  });

  it("過時 warning snapshot 不會保留舊雷暴場景", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          warnings: [warning("WTS", "雷暴警告")],
          warningStatus: "stale",
        }),
      ),
    ).toMatchObject({ scene: "clear" });
  });

  it("新鮮當前 nowcast 達門檻時選擇 rain", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          icons: [62],
          iconStatus: "stale",
          nowcastAmounts: [0, 0, 0.5, 0],
        }),
      ),
    ).toMatchObject({ scene: "rain", precipitation: "light" });
  });

  it("低於門檻的 nowcast 不會選擇 rain", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          icons: [62],
          iconStatus: "stale",
          nowcastAmounts: [0, 0, 0.49, 0],
        }),
      ),
    ).toMatchObject({ scene: "neutral" });
  });

  it("過時 nowcast 不會選擇 rain", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          icons: [62],
          iconStatus: "stale",
          nowcastAmounts: [0, 0, 0.5, 0],
          nowcastStatus: "stale",
        }),
      ),
    ).toMatchObject({ scene: "neutral" });
  });

  it("只在未來時段有雨時不切換目前場景", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          icons: [62],
          iconStatus: "stale",
          nowcastAmounts: [0, 0, 0, 0.5],
        }),
      ),
    ).toMatchObject({ scene: "neutral" });
  });

  it("在 nowcast 時段交界會使用下一個半小時", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          icons: [62],
          iconStatus: "stale",
          generatedAt: "2026-07-16T05:30:00.000Z",
          nowcastAmounts: [0, 0, 0, 0.5],
        }),
      ),
    ).toMatchObject({ scene: "rain", period: "day" });
  });

  it("UTC 午夜對應香港新一天時仍按明確 period 時間判斷", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          icons: [62],
          iconStatus: "stale",
          generatedAt: "2026-07-16T16:00:00.000Z",
          nowcastStartAt: "2026-07-16T15:30:00.000Z",
          nowcastAmounts: [0, 0.5, 0, 0],
        }),
      ),
    ).toMatchObject({ scene: "rain", period: "night" });
  });

  it.each([
    { code: "WRAINA", precipitation: "medium", severity: "caution" },
    { code: "WRAINR", precipitation: "heavy", severity: "danger" },
    { code: "WRAINB", precipitation: "heavy", severity: "danger" },
  ])("$code 暴雨警告 mapping", ({ code, precipitation, severity }) => {
    expect(
      deriveWeatherScene(sceneData({ warnings: [warning(code)] })),
    ).toMatchObject({ scene: "storm", precipitation, severity });
  });

  it.each([
    { code: "TC3", severity: "caution" },
    { code: "TC8NE", severity: "danger" },
  ])("$code 熱帶氣旋警告優先選擇 storm", ({ code, severity }) => {
    expect(
      deriveWeatherScene(sceneData({ warnings: [warning(code)] })),
    ).toMatchObject({ scene: "storm", severity });
  });

  it("fresh 高溫資料在非雨天選擇 hot", () => {
    expect(deriveWeatherScene(sceneData({ temperature: 33 }))).toMatchObject({
      scene: "hot",
      severity: "caution",
    });
  });

  it("fresh 高溫資料不依賴過時天氣圖示", () => {
    expect(
      deriveWeatherScene(
        sceneData({ icons: [62], iconStatus: "stale", temperature: 33 }),
      ),
    ).toMatchObject({ scene: "hot" });
  });

  it("按香港本地時間切換夜間色調", () => {
    expect(deriveWeatherScene(sceneData({ generatedAt: NIGHT }))).toMatchObject({
      scene: "clear",
      period: "night",
    });
  });

  it.each([
    {
      label: "icon 缺失",
      overrides: { icons: null, iconStatus: "missing" as const },
      expected: { scene: "neutral", animationEnabled: false },
    },
    {
      label: "rainfall 缺失",
      overrides: { rainfall: null, rainfallStatus: "missing" as const },
      expected: { scene: "clear", animationEnabled: true },
    },
    {
      label: "weather data 過時",
      overrides: { icons: [64], iconStatus: "stale" as const },
      expected: { scene: "neutral", animationEnabled: false },
    },
  ])("$label時只使用其他仍新鮮的場景訊號", ({ overrides, expected }) => {
    expect(deriveWeatherScene(sceneData(overrides))).toMatchObject({
      scene: expected.scene,
      precipitation: "none",
      animationEnabled: expected.animationEnabled,
    });
  });

  it("warning API 失敗時仍可使用新鮮降雨場景", () => {
    expect(
      deriveWeatherScene(
        sceneData({ warningStatus: "unavailable", warningComplete: false, rainfall: 1.2 }),
      ),
    ).toMatchObject({
      scene: "rain",
      animationEnabled: true,
    });
  });

  it("unknown active warning 仍回到 neutral caution", () => {
    expect(deriveWeatherScene(sceneData({ warnings: [warning("WNEW")] }))).toMatchObject({
      scene: "neutral",
      severity: "caution",
      animationEnabled: false,
    });
  });

  it("取消的 warning 不會選擇 storm", () => {
    expect(
      deriveWeatherScene(sceneData({ warnings: [warning("WTS", "雷暴警告", "CANCEL")] })),
    ).not.toMatchObject({ scene: "storm" });
  });

  it("所有場景訊號不可用時回到 neutral", () => {
    expect(
      deriveWeatherScene(
        sceneData({
          icons: null,
          iconStatus: "missing",
          rainfall: null,
          rainfallStatus: "missing",
          temperature: null,
          temperatureStatus: "missing",
          warningStatus: "unavailable",
          warningComplete: false,
          nowcastStatus: "failed",
        }),
      ),
    ).toMatchObject({ scene: "neutral", animationEnabled: false });
  });

  it("相同 visual scene 的資料更新不改變動畫 key", () => {
    const first = deriveWeatherScene(sceneData({ rainfall: 0.8 }));
    const refreshed = deriveWeatherScene(sceneData({ rainfall: 1.9 }));

    expect(first.reason).not.toBe(refreshed.reason);
    expect(getWeatherSceneVisualKey(first)).toBe(
      getWeatherSceneVisualKey(refreshed),
    );
  });

  it("每個非 neutral 場景都提供可解釋原因", () => {
    expect(deriveWeatherScene(sceneData({ rainfall: 1.2 }))).toMatchObject({
      scene: "rain",
      reason: expect.any(String),
    });
  });
});
