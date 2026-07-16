import { fetchJson, type ApiFetchResult } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  NormalizedAqhi,
  NormalizedForecast,
  NormalizedWarnings,
  NormalizedWeather,
  OutlookLocation,
  OutlookPayload,
  SourceMeta,
} from "@/lib/domain/outlook";
import {
  getDistrictById,
  HONG_KONG_WIDE,
  type LocationId,
} from "@/lib/location/districts";
import { normalizeAqhi } from "@/lib/normalization/aqhi";
import { normalizeForecast } from "@/lib/normalization/forecast";
import { createUnavailableMetric } from "@/lib/normalization/shared";
import { normalizeWarnings } from "@/lib/normalization/warnings";
import { normalizeWeather } from "@/lib/normalization/weather";
import { classifyOverallStatus } from "@/lib/outlook/status";
import { parseAqhi } from "@/lib/validation/aqhi";
import { parseFlw, parseRhrread, parseWarnsum } from "@/lib/validation/hko";
import type { ValidationIssue } from "@/lib/validation/common";

type GovernmentFetcher = (url: string) => Promise<ApiFetchResult>;

export interface AggregateDependencies {
  fetcher?: GovernmentFetcher;
  now?: () => Date;
}

function issueMessages(issues: ValidationIssue[]): string[] {
  return issues.map((issue) => `${issue.path}: ${issue.message}`);
}

function appendIssues<T extends { source: SourceMeta }>(
  normalized: T,
  issues: ValidationIssue[],
): T {
  return {
    ...normalized,
    source: {
      ...normalized.source,
      issues: [...normalized.source.issues, ...issueMessages(issues)],
    },
  };
}

function unavailableSource(
  id: SourceMeta["id"],
  label: string,
  url: string,
  retrievedAt: string,
  message: string,
): SourceMeta {
  return {
    id,
    label,
    url,
    status: "unavailable",
    retrievedAt,
    publishedAt: null,
    rawPublishedAt: null,
    issues: [message],
  };
}

function unavailableWeather(retrievedAt: string, message: string): NormalizedWeather {
  const source = unavailableSource(
    "weather",
    "香港天文台即時天氣",
    API_ENDPOINTS.weather,
    retrievedAt,
    message,
  );
  return {
    rainfallMm: createUnavailableMetric("雨量", "failed", message),
    temperatureC: createUnavailableMetric("氣溫", "failed", message),
    humidityPercent: createUnavailableMetric("相對濕度", "failed", message),
    uvIndex: createUnavailableMetric("紫外線指數", "failed", message),
    icons: [],
    warningMessages: [],
    specialWeatherTips: [],
    source,
  };
}

function unavailableWarnings(retrievedAt: string, message: string): NormalizedWarnings {
  return {
    items: [],
    isSnapshotComplete: false,
    source: unavailableSource(
      "warnings",
      "香港天文台天氣警告",
      API_ENDPOINTS.warnings,
      retrievedAt,
      message,
    ),
  };
}

function unavailableForecast(retrievedAt: string, message: string): NormalizedForecast {
  return {
    description: createUnavailableMetric("本港天氣預報", "failed", message),
    forecastPeriod: null,
    generalSituation: null,
    outlook: null,
    source: unavailableSource(
      "forecast",
      "香港天文台本港天氣預報",
      API_ENDPOINTS.forecast,
      retrievedAt,
      message,
    ),
  };
}

function unavailableAqhi(retrievedAt: string, message: string): NormalizedAqhi {
  return {
    aqhi: createUnavailableMetric("空氣質素健康指數（AQHI）", "failed", message),
    healthRisk: null,
    source: unavailableSource(
      "aqhi",
      "環境保護署空氣質素健康指數",
      API_ENDPOINTS.aqhi,
      retrievedAt,
      message,
    ),
  };
}

function locationDetails(locationId: LocationId): OutlookLocation {
  if (locationId === HONG_KONG_WIDE.id) {
    return {
      id: HONG_KONG_WIDE.id,
      label: HONG_KONG_WIDE.nameTc,
      localized: false,
      note: "非地區化結果；雨量及 AQHI 採用全港有效資料中的保守代表值。",
    };
  }

  const district = getDistrictById(locationId);
  return {
    id: locationId,
    label: district?.nameTc ?? HONG_KONG_WIDE.nameTc,
    localized: Boolean(district),
    note: district
      ? "按地區雨量及官方代表監測站評估。"
      : "找不到地區設定，結果可能不完整。",
  };
}

function failureMessage(result: ApiFetchResult, fallback: string): string {
  return result.ok ? fallback : result.error.message;
}

export async function buildOutlookPayload(
  locationId: LocationId,
  dependencies: AggregateDependencies = {},
): Promise<OutlookPayload> {
  const fetcher = dependencies.fetcher ?? ((url: string) => fetchJson(url));
  const now = dependencies.now?.() ?? new Date();
  const generatedAt = now.toISOString();

  const [weatherResult, warningResult, forecastResult, aqhiResult] = await Promise.all([
    fetcher(API_ENDPOINTS.weather),
    fetcher(API_ENDPOINTS.warnings),
    fetcher(API_ENDPOINTS.forecast),
    fetcher(API_ENDPOINTS.aqhi),
  ]);

  let weather: NormalizedWeather;
  if (!weatherResult.ok) {
    weather = unavailableWeather(generatedAt, weatherResult.error.message);
  } else {
    const parsed = parseRhrread(weatherResult.data);
    weather = parsed.ok
      ? appendIssues(
          normalizeWeather(parsed.value, locationId, weatherResult.retrievedAt, now),
          parsed.issues,
        )
      : unavailableWeather(
          weatherResult.retrievedAt,
          issueMessages(parsed.issues).join("；") || "即時天氣資料格式異常。",
        );
  }

  let warnings: NormalizedWarnings;
  if (!warningResult.ok) {
    warnings = unavailableWarnings(generatedAt, warningResult.error.message);
  } else {
    const parsed = parseWarnsum(warningResult.data);
    if (parsed.ok) {
      const normalized = appendIssues(
        normalizeWarnings(parsed.value, warningResult.retrievedAt, now),
        parsed.issues,
      );
      warnings = {
        ...normalized,
        isSnapshotComplete: !parsed.issues.some(
          (validationIssue) => validationIssue.impact === "item",
        ),
      };
    } else {
      warnings = unavailableWarnings(
        warningResult.retrievedAt,
        issueMessages(parsed.issues).join("；") || "警告資料格式異常。",
      );
    }
  }

  let forecast: NormalizedForecast;
  if (!forecastResult.ok) {
    forecast = unavailableForecast(generatedAt, forecastResult.error.message);
  } else {
    const parsed = parseFlw(forecastResult.data);
    forecast = parsed.ok
      ? appendIssues(
          normalizeForecast(parsed.value, forecastResult.retrievedAt, now),
          parsed.issues,
        )
      : unavailableForecast(
          forecastResult.retrievedAt,
          issueMessages(parsed.issues).join("；") || "預報資料格式異常。",
        );
  }

  let aqhi: NormalizedAqhi;
  if (!aqhiResult.ok) {
    aqhi = unavailableAqhi(generatedAt, aqhiResult.error.message);
  } else {
    const parsed = parseAqhi(aqhiResult.data);
    aqhi = parsed.ok
      ? appendIssues(
          normalizeAqhi(parsed.value, locationId, aqhiResult.retrievedAt, now),
          parsed.issues,
        )
      : unavailableAqhi(
          aqhiResult.retrievedAt,
          issueMessages(parsed.issues).join("；") || "AQHI 資料格式異常。",
        );
  }

  const sources = [weather.source, warnings.source, forecast.source, aqhi.source];
  return {
    status: classifyOverallStatus(sources),
    generatedAt,
    location: locationDetails(locationId),
    weather,
    warnings,
    forecast,
    aqhi,
    sources,
  };
}

/** Used only by tests to create a readable fallback assertion. */
export const getFailureMessage = failureMessage;
