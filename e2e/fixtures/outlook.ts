import type {
  NormalizedMetric,
  OutlookPayload,
  SourceId,
  SourceMeta,
} from "../../lib/domain/outlook";
import type { LocationId } from "../../lib/location/districts";

const GENERATED_AT = "2026-07-27T06:00:00.000Z";
const PUBLISHED_AT = "2026-07-27T05:55:00.000Z";
const RAW_PUBLISHED_AT = "2026-07-27T13:55:00+08:00";

const LOCATION_LABELS: Partial<Record<LocationId, string>> = {
  "hong-kong": "香港整體",
  "central-and-western": "中西區",
  "wan-chai": "灣仔",
  "sha-tin": "沙田",
};

const SOURCE_LABELS: Record<SourceId, string> = {
  weather: "香港天文台即時天氣",
  warnings: "香港天文台天氣警告",
  forecast: "香港天文台本港天氣預報",
  aqhi: "環境保護署空氣質素健康指數",
  rainfallNowcast: "香港天文台兩小時降雨臨近預報",
};

function metric<T>(
  label: string,
  value: T,
  place: string,
): NormalizedMetric<T> {
  return {
    status: "fresh",
    value,
    label,
    place,
    publishedAt: PUBLISHED_AT,
    rawPublishedAt: RAW_PUBLISHED_AT,
    message: "資料有效。",
  };
}

function source(id: SourceId): SourceMeta {
  return {
    id,
    label: SOURCE_LABELS[id],
    url: `https://example.invalid/${id}`,
    status: "ok",
    retrievedAt: GENERATED_AT,
    publishedAt: PUBLISHED_AT,
    rawPublishedAt: RAW_PUBLISHED_AT,
    issues: [],
  };
}

export function buildOutlookFixture(
  locationId: LocationId = "hong-kong",
): OutlookPayload {
  const localized = locationId !== "hong-kong";
  const locationLabel = LOCATION_LABELS[locationId] ?? "測試地區";
  const rainfall = locationId === "central-and-western" ? 5 : 0;
  const weatherSource = source("weather");
  const warningSource = source("warnings");
  const forecastSource = source("forecast");
  const aqhiSource = source("aqhi");
  const rainfallNowcastSource = source("rainfallNowcast");

  return {
    status: "ok",
    generatedAt: GENERATED_AT,
    location: {
      id: locationId,
      label: locationLabel,
      localized,
      note: localized
        ? "按地區即時雨量、最近預報格點及官方代表監測站評估。"
        : "非地區化結果；即時雨量及 AQHI 採用全港有效資料中的保守代表值，未來降雨採用十八區代表格點最高值。",
    },
    weather: {
      conditionIcons: metric("天氣狀況", [50], "香港天文台"),
      rainfallMm: metric("雨量", rainfall, locationLabel),
      temperatureC: metric("氣溫", 30, "香港天文台"),
      humidityPercent: metric("相對濕度", 80, "香港天文台"),
      uvIndex: metric("紫外線指數", 7, "京士柏"),
      icons: [50],
      warningMessages: [],
      specialWeatherTips: [],
      source: weatherSource,
    },
    warnings: {
      items: [],
      isSnapshotComplete: true,
      source: warningSource,
    },
    forecast: {
      description: metric(
        "本港天氣預報",
        "大致天晴，部分時間有陽光。",
        "香港",
      ),
      forecastPeriod: "本日下午及今晚",
      generalSituation: "華南沿岸天氣普遍晴朗。",
      outlook: "隨後數日部分時間有陽光。",
      source: forecastSource,
    },
    aqhi: {
      aqhi: metric(
        "空氣質素健康指數（AQHI）",
        { value: 7, display: "7" },
        localized ? `${locationLabel}監測站` : "全港一般監測站最高",
      ),
      healthRisk: "Moderate",
      source: aqhiSource,
    },
    rainfallNowcast: {
      forecast: metric(
        "未來降雨預報",
        {
          periods: [
            {
              periodStartAt: "2026-07-27T05:55:00.000Z",
              periodEndAt: "2026-07-27T06:25:00.000Z",
              rainfallMm: 0,
              isPartiallyElapsed: true,
            },
            {
              periodStartAt: "2026-07-27T06:25:00.000Z",
              periodEndAt: "2026-07-27T06:55:00.000Z",
              rainfallMm: 0,
              isPartiallyElapsed: false,
            },
            {
              periodStartAt: "2026-07-27T06:55:00.000Z",
              periodEndAt: "2026-07-27T07:25:00.000Z",
              rainfallMm: 0,
              isPartiallyElapsed: false,
            },
            {
              periodStartAt: "2026-07-27T07:25:00.000Z",
              periodEndAt: "2026-07-27T07:55:00.000Z",
              rainfallMm: 0,
              isPartiallyElapsed: false,
            },
          ],
          coverageEndAt: "2026-07-27T07:55:00.000Z",
          remainingCoverageMinutes: 115,
          firstRainWindow: null,
          peakRainPeriodIndex: 0,
        },
        localized ? locationLabel : "十八區代表格點最高",
      ),
      source: rainfallNowcastSource,
    },
    sources: [
      weatherSource,
      warningSource,
      forecastSource,
      aqhiSource,
      rainfallNowcastSource,
    ],
  };
}
