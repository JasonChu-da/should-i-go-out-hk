import {
  RAINFALL_NOWCAST_SIGNAL_MM,
  type NormalizedMetric,
  type NormalizedWarning,
  type OverallDataStatus,
  type RainfallNowcastPeriod,
  type RainfallNowcastValue,
  type SourceStatus,
} from "@/lib/domain/outlook";
import { findHighestPriorityWeatherIcon } from "@/lib/weather-scene/weather-icon-map";
import { hongKongWeatherPeriod } from "@/lib/weather-scene/hong-kong-period";
import type {
  WeatherPeriod,
  WeatherPrecipitation,
  WeatherSceneResult,
  WeatherSceneSeverity,
} from "@/lib/weather-scene/types";

const HOT_TEMPERATURE_C = 33;

const PRECIPITATION_ORDER: Readonly<Record<WeatherPrecipitation, number>> = {
  none: 0,
  light: 1,
  medium: 2,
  heavy: 3,
};

interface WarningSceneRule {
  precipitation: WeatherPrecipitation;
  severity: WeatherSceneSeverity;
  reason: string;
  priority: number;
  scene: "storm" | "hot";
}

const WARNING_SCENE_RULES: Readonly<Partial<Record<string, WarningSceneRule>>> =
  Object.freeze({
    WRAINB: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "黑色暴雨警告現正生效。", priority: 1000 },
    WRAINR: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "紅色暴雨警告現正生效。", priority: 950 },
    WRAINA: { scene: "storm", precipitation: "medium", severity: "caution", reason: "黃色暴雨警告現正生效。", priority: 900 },
    WTS: { scene: "storm", precipitation: "medium", severity: "danger", reason: "雷暴警告現正生效。", priority: 940 },
    TC10: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "十號颶風信號現正生效。", priority: 1000 },
    TC9: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "九號烈風或暴風風力增強信號現正生效。", priority: 995 },
    TC8NE: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "八號熱帶氣旋警告信號現正生效。", priority: 990 },
    TC8SE: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "八號熱帶氣旋警告信號現正生效。", priority: 990 },
    TC8NW: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "八號熱帶氣旋警告信號現正生效。", priority: 990 },
    TC8SW: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "八號熱帶氣旋警告信號現正生效。", priority: 990 },
    TC3: { scene: "storm", precipitation: "none", severity: "caution", reason: "三號強風信號現正生效。", priority: 880 },
    TC1: { scene: "storm", precipitation: "none", severity: "caution", reason: "一號戒備信號現正生效。", priority: 860 },
    WTMW: { scene: "storm", precipitation: "heavy", severity: "danger", reason: "海嘯警告現正生效。", priority: 1000 },
    WMSGNL: { scene: "storm", precipitation: "none", severity: "caution", reason: "強烈季候風信號現正生效。", priority: 850 },
    WFNTSA: { scene: "storm", precipitation: "medium", severity: "caution", reason: "新界北部水浸特別報告現正生效。", priority: 870 },
    WL: { scene: "storm", precipitation: "none", severity: "caution", reason: "山泥傾瀉警告現正生效。", priority: 840 },
    WHOT: { scene: "hot", precipitation: "none", severity: "caution", reason: "酷熱天氣警告現正生效。", priority: 830 },
  });

const KNOWN_NON_SKY_WARNINGS = new Set([
  "WCOLD",
  "WFROST",
  "WFIREY",
  "WFIRER",
]);

export interface WeatherSceneData {
  status: OverallDataStatus;
  generatedAt: string;
  weather: {
    conditionIcons: NormalizedMetric<number[]>;
    rainfallMm: NormalizedMetric<number>;
    temperatureC: NormalizedMetric<number>;
  };
  warnings: {
    items: NormalizedWarning[];
    isSnapshotComplete: boolean;
    source: { status: SourceStatus };
  };
  rainfallNowcast: {
    forecast: NormalizedMetric<RainfallNowcastValue>;
  };
}

function precipitationForRainfall(rainfallMm: number): WeatherPrecipitation {
  if (rainfallMm >= 10) return "heavy";
  if (rainfallMm >= 2.5) return "medium";
  if (rainfallMm > 0) return "light";
  return "none";
}

function strongestPrecipitation(
  left: WeatherPrecipitation,
  right: WeatherPrecipitation,
): WeatherPrecipitation {
  return PRECIPITATION_ORDER[left] >= PRECIPITATION_ORDER[right] ? left : right;
}

function currentNowcastPeriod(
  value: RainfallNowcastValue,
  generatedAt: string,
): RainfallNowcastPeriod | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return null;

  return (
    value.periods.find((period) => {
      const periodStartMs = Date.parse(period.periodStartAt);
      const periodEndMs = Date.parse(period.periodEndAt);
      return (
        Number.isFinite(periodStartMs) &&
        Number.isFinite(periodEndMs) &&
        periodStartMs <= generatedAtMs &&
        generatedAtMs < periodEndMs
      );
    }) ?? null
  );
}

function freshRainfallPrecipitation(
  metric: NormalizedMetric<number>,
): WeatherPrecipitation {
  return metric.status === "fresh" && metric.value !== null
    ? precipitationForRainfall(metric.value)
    : "none";
}

function freshNowcastPrecipitation(
  metric: NormalizedMetric<RainfallNowcastValue>,
  generatedAt: string,
): WeatherPrecipitation {
  if (metric.status !== "fresh" || metric.value === null) return "none";

  const period = currentNowcastPeriod(metric.value, generatedAt);
  if (period === null || period.rainfallMm < RAINFALL_NOWCAST_SIGNAL_MM) {
    return "none";
  }

  return precipitationForRainfall(period.rainfallMm);
}

function neutral(period: WeatherPeriod, reason: string): WeatherSceneResult {
  return {
    scene: "neutral",
    period,
    precipitation: "none",
    severity: "caution",
    animationEnabled: false,
    reason,
  };
}

function highestPriorityWarning(
  warnings: readonly NormalizedWarning[],
): WarningSceneRule | null {
  let selected: WarningSceneRule | null = null;
  for (const warning of warnings) {
    if (warning.actionCode.trim().toUpperCase() === "CANCEL") continue;
    const rule = WARNING_SCENE_RULES[warning.code.trim().toUpperCase()];
    if (rule && (selected === null || rule.priority > selected.priority)) {
      selected = rule;
    }
  }
  return selected;
}

function hasUnknownActiveWarning(warnings: readonly NormalizedWarning[]): boolean {
  return warnings.some((warning) => {
    if (warning.actionCode.trim().toUpperCase() === "CANCEL") return false;
    const code = warning.code.trim().toUpperCase();
    return !WARNING_SCENE_RULES[code] && !KNOWN_NON_SKY_WARNINGS.has(code);
  });
}

/**
 * Pure, deterministic scene derivation. It only consumes normalized,
 * freshness-labelled government observations and the payload generation time.
 */
export function deriveWeatherScene(
  weatherData: WeatherSceneData | null,
  fallbackPeriod: WeatherPeriod = "day",
): WeatherSceneResult {
  const scene = deriveWeatherSceneInternal(weatherData);
  if (
    weatherData === null ||
    hongKongWeatherPeriod(weatherData.generatedAt) === null
  ) {
    return { ...scene, period: fallbackPeriod };
  }
  return scene;
}

function deriveWeatherSceneInternal(
  weatherData: WeatherSceneData | null,
): WeatherSceneResult {
  if (weatherData === null) {
    return neutral("day", "尚未取得可驗證的天氣資料。");
  }

  const period = hongKongWeatherPeriod(weatherData.generatedAt);
  if (period === null) {
    return neutral("day", "資料更新時間無效，無法確認香港目前是日間或夜間。");
  }

  if (weatherData.status === "error") {
    return neutral(period, "官方天氣資料目前不可用。");
  }

  const { conditionIcons, rainfallMm, temperatureC } = weatherData.weather;
  const warningSourceUsable = weatherData.warnings.source.status === "ok";
  const warningRule = warningSourceUsable
    ? highestPriorityWarning(weatherData.warnings.items)
    : null;

  if (warningRule?.scene === "storm") {
    return {
      scene: "storm",
      period,
      precipitation: strongestPrecipitation(
        warningRule.precipitation,
        freshRainfallPrecipitation(rainfallMm),
      ),
      severity: warningRule.severity,
      animationEnabled: true,
      reason: warningRule.reason,
    };
  }

  if (warningSourceUsable && hasUnknownActiveWarning(weatherData.warnings.items)) {
    return neutral(period, "有未能識別的生效警告，不推測目前天氣場景。");
  }

  const iconRule =
    conditionIcons.status === "fresh" && conditionIcons.value !== null
      ? findHighestPriorityWeatherIcon(conditionIcons.value)
      : null;

  if (iconRule?.scene === "storm") {
    return {
      scene: "storm",
      period,
      precipitation: strongestPrecipitation(
        iconRule.precipitation,
        freshRainfallPrecipitation(rainfallMm),
      ),
      severity: iconRule.severity,
      animationEnabled: true,
      reason: `香港天文台天氣圖示顯示${iconRule.caption}。`,
    };
  }

  const rainfallPrecipitation = freshRainfallPrecipitation(rainfallMm);
  if (rainfallPrecipitation !== "none") {
    return {
      scene: "rain",
      period,
      precipitation: rainfallPrecipitation,
      severity: rainfallPrecipitation === "heavy" ? "caution" : "normal",
      animationEnabled: true,
      reason: `所選地區過去一小時錄得 ${rainfallMm.value} 毫米雨量。`,
    };
  }

  const nowcastPrecipitation = freshNowcastPrecipitation(
    weatherData.rainfallNowcast.forecast,
    weatherData.generatedAt,
  );
  if (nowcastPrecipitation !== "none") {
    return {
      scene: "rain",
      period,
      precipitation: nowcastPrecipitation,
      severity: nowcastPrecipitation === "heavy" ? "caution" : "normal",
      animationEnabled: true,
      reason: "目前半小時降雨臨近預報達到降雨場景門檻。",
    };
  }

  if (iconRule?.scene === "rain") {
    return {
      scene: "rain",
      period,
      precipitation: iconRule.precipitation,
      severity: iconRule.severity,
      animationEnabled: true,
      reason: `香港天文台天氣圖示顯示${iconRule.caption}。`,
    };
  }

  if (warningRule?.scene === "hot") {
    return {
      scene: "hot",
      period,
      precipitation: "none",
      severity: warningRule.severity,
      animationEnabled: true,
      reason: warningRule.reason,
    };
  }

  if (
    temperatureC.status === "fresh" &&
    temperatureC.value !== null &&
    temperatureC.value >= HOT_TEMPERATURE_C
  ) {
    return {
      scene: "hot",
      period,
      precipitation: "none",
      severity: "caution",
      animationEnabled: true,
      reason: `最新氣溫為 ${temperatureC.value}°C，使用炎熱天色。`,
    };
  }

  if (iconRule !== null) {
    return {
      scene: iconRule.scene,
      period,
      precipitation: "none",
      severity: iconRule.severity,
      animationEnabled: true,
      reason: `香港天文台天氣圖示顯示${iconRule.caption}。`,
    };
  }

  return neutral(period, "沒有新鮮的天氣圖示、即時雨量或當前短時降雨訊號。");
}
