import { describe, expect, it } from "vitest";

import type {
  MetricStatus,
  NormalizedMetric,
  NormalizedWarning,
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

function warning(code: string, name = code): NormalizedWarning {
  return {
    family: code.startsWith("TC") ? "WTCSGNL" : code,
    code,
    name,
    actionCode: "ISSUE",
    type: null,
    issueTime: null,
    updateTime: null,
    expireTime: null,
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
  };
}

describe("deriveWeatherScene", () => {
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
    },
    {
      label: "rainfall 缺失",
      overrides: { rainfall: null, rainfallStatus: "missing" as const },
    },
    {
      label: "weather data 過時",
      overrides: { icons: [64], iconStatus: "stale" as const },
    },
  ])("$label時使用 neutral 並停動畫", ({ overrides }) => {
    expect(deriveWeatherScene(sceneData(overrides))).toMatchObject({
      scene: "neutral",
      precipitation: "none",
      animationEnabled: false,
    });
  });

  it("warning API 失敗時不根據其他資料猜測安全場景", () => {
    expect(
      deriveWeatherScene(sceneData({ warningStatus: "unavailable" })),
    ).toMatchObject({
      scene: "neutral",
      severity: "caution",
      animationEnabled: false,
    });
  });

  it("相同 visual scene 的資料更新不改變動畫 key", () => {
    const first = deriveWeatherScene(sceneData({ rainfall: 0.8 }));
    const refreshed = deriveWeatherScene(sceneData({ rainfall: 1.9 }));

    expect(first.reason).not.toBe(refreshed.reason);
    expect(getWeatherSceneVisualKey(first)).toBe(
      getWeatherSceneVisualKey(refreshed),
    );
  });
});
