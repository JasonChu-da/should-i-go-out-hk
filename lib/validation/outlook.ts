import type {
  NormalizedMetric,
  NormalizedWarning,
  OutlookPayload,
  RainfallNowcastValue,
  SourceMeta,
} from "@/lib/domain/outlook";
import { RAINFALL_NOWCAST_SIGNAL_MM } from "@/lib/domain/outlook";
import { OUTLOOK_NUMERIC_RANGES } from "@/lib/domain/outlook";
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
const EXPECTED_SOURCE_IDS = [
  "weather",
  "warnings",
  "forecast",
  "aqhi",
  "rainfallNowcast",
] as const;
const SOURCE_IDS = new Set<string>(EXPECTED_SOURCE_IDS);
const LOCATION_IDS = new Set(LOCATIONS.map((location) => location.id));

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) && date.toISOString() === value
  );
};

function isMetric<T>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is T,
): value is NormalizedMetric<T> {
  if (!isRecord(value)) return false;

  const hasValue = value.value !== null;
  const statusHasValue = value.status === "fresh" || value.status === "stale";

  return (
    typeof value.status === "string" &&
    METRIC_STATUSES.has(value.status) &&
    hasValue === statusHasValue &&
    (!hasValue || isValue(value.value)) &&
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

const isNumberInRange = (
  value: unknown,
  range: Readonly<{ min: number; max: number }>,
): value is number =>
  isFiniteNumber(value) && value >= range.min && value <= range.max;

const isAqhiValue = (
  value: unknown,
): value is { value: number; display: string } =>
  isRecord(value) &&
  Number.isInteger(value.value) &&
  isNumberInRange(value.value, OUTLOOK_NUMERIC_RANGES.aqhi) &&
  value.display === (value.value === 11 ? "10+" : String(value.value));

function isRainfallNowcastValue(
  value: unknown,
  generatedAt: string,
  publishedAt: string | null,
): value is RainfallNowcastValue {
  if (!isRecord(value) || !Array.isArray(value.periods)) return false;
  if (value.periods.length !== 4) return false;

  const generatedAtMs = Date.parse(generatedAt);
  let previousEnd = Number.NaN;
  for (const [index, period] of value.periods.entries()) {
    if (
      !isRecord(period) ||
      !isIsoTimestamp(period.periodStartAt) ||
      !isIsoTimestamp(period.periodEndAt) ||
      !isNumberInRange(
        period.rainfallMm,
        OUTLOOK_NUMERIC_RANGES.rainfallNowcastMm,
      ) ||
      typeof period.isPartiallyElapsed !== "boolean"
    ) {
      return false;
    }

    const start = Date.parse(period.periodStartAt);
    const end = Date.parse(period.periodEndAt);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end - start !== 30 * 60_000 ||
      (index > 0 && start !== previousEnd) ||
      period.isPartiallyElapsed !==
        (start < generatedAtMs && generatedAtMs < end)
    ) {
      return false;
    }
    previousEnd = end;
  }

  if (
    publishedAt !== value.periods[0].periodStartAt ||
    typeof value.coverageEndAt !== "string" ||
    value.coverageEndAt !== value.periods[3].periodEndAt ||
    !Number.isInteger(value.remainingCoverageMinutes) ||
    value.remainingCoverageMinutes !==
      Math.max(
        0,
        Math.min(
          120,
          Math.ceil(
            (Date.parse(value.coverageEndAt) - generatedAtMs) / 60_000,
          ),
        ),
      )
  ) {
    return false;
  }

  let first = -1;
  let last = -1;
  for (const [index, period] of value.periods.entries()) {
    const hasRain =
      Date.parse(period.periodEndAt) > generatedAtMs &&
      period.rainfallMm >= RAINFALL_NOWCAST_SIGNAL_MM;
    if (first === -1) {
      if (hasRain) {
        first = index;
        last = index;
      }
    } else if (hasRain) {
      last = index;
    } else {
      break;
    }
  }
  const expectedWindow =
    first === -1 ? null : { firstPeriodIndex: first, lastPeriodIndex: last };
  if (
    (expectedWindow === null) !== (value.firstRainWindow === null) ||
    (expectedWindow !== null &&
      (!isRecord(value.firstRainWindow) ||
        value.firstRainWindow.firstPeriodIndex !==
          expectedWindow.firstPeriodIndex ||
        value.firstRainWindow.lastPeriodIndex !==
          expectedWindow.lastPeriodIndex))
  ) {
    return false;
  }

  let expectedPeak: number | null = null;
  for (const [index, period] of value.periods.entries()) {
    if (Date.parse(period.periodEndAt) <= generatedAtMs) continue;
    if (
      expectedPeak === null ||
      period.rainfallMm > value.periods[expectedPeak].rainfallMm
    ) {
      expectedPeak = index;
    }
  }

  return value.peakRainPeriodIndex === expectedPeak;
}

/**
 * Runtime boundary for the browser-facing internal route. Even though the
 * server is ours, a truncated proxy response or future contract drift must
 * become the existing retry state instead of crashing React rendering.
 */
export function isOutlookPayload(value: unknown): value is OutlookPayload {
  if (!isRecord(value)) return false;

  if (
    !["ok", "partial", "error"].includes(String(value.status)) ||
    !isIsoTimestamp(value.generatedAt) ||
    !isRecord(value.location) ||
    typeof value.location.id !== "string" ||
    !LOCATION_IDS.has(value.location.id) ||
    typeof value.location.label !== "string" ||
    typeof value.location.localized !== "boolean" ||
    typeof value.location.note !== "string" ||
    !isRecord(value.weather) ||
    !isRecord(value.warnings) ||
    !isRecord(value.forecast) ||
    !isRecord(value.aqhi) ||
    !isRecord(value.rainfallNowcast)
  ) {
    return false;
  }

  const weather = value.weather;
  const warnings = value.warnings;
  const forecast = value.forecast;
  const aqhi = value.aqhi;
  const rainfallNowcast = value.rainfallNowcast;
  const generatedAt = value.generatedAt as string;
  const sources = value.sources;
  const actualSourceIds = Array.isArray(sources)
    ? new Set(sources.map((source) => (isRecord(source) ? source.id : null)))
    : new Set<unknown>();

  return (
    isMetric(
      weather.conditionIcons,
      (candidate): candidate is number[] =>
        Array.isArray(candidate) && candidate.every(isFiniteNumber),
    ) &&
    isMetric(weather.rainfallMm, (candidate): candidate is number =>
      isNumberInRange(candidate, OUTLOOK_NUMERIC_RANGES.rainfallMm),
    ) &&
    isMetric(weather.temperatureC, (candidate): candidate is number =>
      isNumberInRange(candidate, OUTLOOK_NUMERIC_RANGES.temperatureC),
    ) &&
    isMetric(weather.humidityPercent, (candidate): candidate is number =>
      isNumberInRange(candidate, OUTLOOK_NUMERIC_RANGES.humidityPercent),
    ) &&
    isMetric(weather.uvIndex, (candidate): candidate is number =>
      isNumberInRange(candidate, OUTLOOK_NUMERIC_RANGES.uvIndex),
    ) &&
    Array.isArray(weather.icons) &&
    weather.icons.every(isFiniteNumber) &&
    isStringArray(weather.warningMessages) &&
    isStringArray(weather.specialWeatherTips) &&
    isSourceMeta(weather.source) &&
    weather.source.id === "weather" &&
    Array.isArray(warnings.items) &&
    warnings.items.every(isWarning) &&
    typeof warnings.isSnapshotComplete === "boolean" &&
    isSourceMeta(warnings.source) &&
    warnings.source.id === "warnings" &&
    isMetric(forecast.description, (candidate): candidate is string =>
      typeof candidate === "string",
    ) &&
    isNullableString(forecast.forecastPeriod) &&
    isNullableString(forecast.generalSituation) &&
    isNullableString(forecast.outlook) &&
    isSourceMeta(forecast.source) &&
    forecast.source.id === "forecast" &&
    isMetric(aqhi.aqhi, isAqhiValue) &&
    isNullableString(aqhi.healthRisk) &&
    isSourceMeta(aqhi.source) &&
    aqhi.source.id === "aqhi" &&
    isMetric(
      rainfallNowcast.forecast,
      (candidate): candidate is RainfallNowcastValue =>
        isRainfallNowcastValue(
          candidate,
          generatedAt,
          isRecord(rainfallNowcast.forecast) &&
            typeof rainfallNowcast.forecast.publishedAt === "string"
            ? rainfallNowcast.forecast.publishedAt
            : null,
        ),
    ) &&
    ["fresh", "stale"].includes(
      String(
        isRecord(rainfallNowcast.forecast)
          ? rainfallNowcast.forecast.status
          : "",
      ),
    ) ===
      (isRecord(rainfallNowcast.forecast) &&
        rainfallNowcast.forecast.value !== null) &&
    isSourceMeta(rainfallNowcast.source) &&
    rainfallNowcast.source.id === "rainfallNowcast" &&
    isRecord(rainfallNowcast.forecast) &&
    rainfallNowcast.source.publishedAt ===
      rainfallNowcast.forecast.publishedAt &&
    Array.isArray(sources) &&
    sources.length === EXPECTED_SOURCE_IDS.length &&
    sources.every(isSourceMeta) &&
    actualSourceIds.size === EXPECTED_SOURCE_IDS.length &&
    EXPECTED_SOURCE_IDS.every((id) => actualSourceIds.has(id))
  );
}
