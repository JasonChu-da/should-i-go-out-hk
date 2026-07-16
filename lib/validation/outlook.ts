import type {
  NormalizedMetric,
  NormalizedWarning,
  OutlookPayload,
  SourceMeta,
} from "@/lib/domain/outlook";
import { LOCATIONS } from "@/lib/location/districts";
import { isRecord } from "@/lib/validation/common";

const METRIC_STATUSES = new Set([
  "fresh",
  "stale",
  "missing",
  "malformed",
  "notApplicable",
  "failed",
]);
const SOURCE_STATUSES = new Set(["ok", "stale", "unavailable"]);
const SOURCE_IDS = new Set(["weather", "warnings", "forecast", "aqhi"]);
const LOCATION_IDS = new Set(LOCATIONS.map((location) => location.id));

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function isMetric<T>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is T,
): value is NormalizedMetric<T> {
  if (!isRecord(value)) return false;

  return (
    typeof value.status === "string" &&
    METRIC_STATUSES.has(value.status) &&
    (value.value === null || isValue(value.value)) &&
    typeof value.label === "string" &&
    isNullableString(value.place) &&
    isNullableString(value.publishedAt) &&
    isNullableString(value.rawPublishedAt) &&
    typeof value.message === "string"
  );
}

function isSourceMeta(value: unknown): value is SourceMeta {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    SOURCE_IDS.has(value.id) &&
    typeof value.label === "string" &&
    typeof value.url === "string" &&
    typeof value.status === "string" &&
    SOURCE_STATUSES.has(value.status) &&
    typeof value.retrievedAt === "string" &&
    isNullableString(value.publishedAt) &&
    isNullableString(value.rawPublishedAt) &&
    isStringArray(value.issues)
  );
}

function isWarning(value: unknown): value is NormalizedWarning {
  if (!isRecord(value)) return false;

  return (
    typeof value.family === "string" &&
    typeof value.code === "string" &&
    typeof value.name === "string" &&
    typeof value.actionCode === "string" &&
    isNullableString(value.type) &&
    isNullableString(value.issueTime) &&
    isNullableString(value.updateTime) &&
    isNullableString(value.expireTime)
  );
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isAqhiValue = (
  value: unknown,
): value is { value: number; display: string } =>
  isRecord(value) &&
  isFiniteNumber(value.value) &&
  typeof value.display === "string";

/**
 * Runtime boundary for the browser-facing internal route. Even though the
 * server is ours, a truncated proxy response or future contract drift must
 * become the existing retry state instead of crashing React rendering.
 */
export function isOutlookPayload(value: unknown): value is OutlookPayload {
  if (!isRecord(value)) return false;

  if (
    !["ok", "partial", "error"].includes(String(value.status)) ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !isRecord(value.location) ||
    typeof value.location.id !== "string" ||
    !LOCATION_IDS.has(value.location.id) ||
    typeof value.location.label !== "string" ||
    typeof value.location.localized !== "boolean" ||
    typeof value.location.note !== "string" ||
    !isRecord(value.weather) ||
    !isRecord(value.warnings) ||
    !isRecord(value.forecast) ||
    !isRecord(value.aqhi)
  ) {
    return false;
  }

  const weather = value.weather;
  const warnings = value.warnings;
  const forecast = value.forecast;
  const aqhi = value.aqhi;

  return (
    isMetric(weather.rainfallMm, isFiniteNumber) &&
    isMetric(weather.temperatureC, isFiniteNumber) &&
    isMetric(weather.humidityPercent, isFiniteNumber) &&
    isMetric(weather.uvIndex, isFiniteNumber) &&
    Array.isArray(weather.icons) &&
    weather.icons.every(isFiniteNumber) &&
    isStringArray(weather.warningMessages) &&
    isStringArray(weather.specialWeatherTips) &&
    isSourceMeta(weather.source) &&
    Array.isArray(warnings.items) &&
    warnings.items.every(isWarning) &&
    typeof warnings.isSnapshotComplete === "boolean" &&
    isSourceMeta(warnings.source) &&
    isMetric(forecast.description, (candidate): candidate is string =>
      typeof candidate === "string",
    ) &&
    isNullableString(forecast.forecastPeriod) &&
    isNullableString(forecast.generalSituation) &&
    isNullableString(forecast.outlook) &&
    isSourceMeta(forecast.source) &&
    isMetric(aqhi.aqhi, isAqhiValue) &&
    isNullableString(aqhi.healthRisk) &&
    isSourceMeta(aqhi.source) &&
    Array.isArray(value.sources) &&
    value.sources.length === 4 &&
    value.sources.every(isSourceMeta)
  );
}
