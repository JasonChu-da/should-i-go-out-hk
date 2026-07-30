const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * All source-age limits live here so display and scoring code cannot drift.
 * A source exactly on either boundary remains fresh.
 */
export const FRESHNESS_THRESHOLDS_MS = Object.freeze({
  weather: 90 * MINUTE_MS,
  aqhi: 3 * HOUR_MS,
  warnings: 30 * MINUTE_MS,
  forecast: 12 * HOUR_MS,
  rainfallNowcast: 24 * MINUTE_MS,
  futureSkew: 5 * MINUTE_MS,
});

export type FreshnessStatus = "fresh" | "stale" | "invalid" | "future";
export type TimestampInput = string | number | Date | null | undefined;

function toEpochMilliseconds(value: TimestampInput): number | null {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  return null;
}

/**
 * Pure freshness assessment. Slight source/server clock differences of up to
 * five minutes are accepted; a later timestamp is explicitly marked future.
 */
export function assessFreshness(
  timestamp: TimestampInput,
  now: TimestampInput,
  maxAge: number,
): FreshnessStatus {
  const timestampMs = toEpochMilliseconds(timestamp);
  const nowMs = toEpochMilliseconds(now);

  if (
    timestampMs === null ||
    nowMs === null ||
    !Number.isFinite(maxAge) ||
    maxAge < 0
  ) {
    return "invalid";
  }

  const age = nowMs - timestampMs;

  if (age < -FRESHNESS_THRESHOLDS_MS.futureSkew) {
    return "future";
  }

  return age <= maxAge ? "fresh" : "stale";
}

const HKT_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/i;

function isValidCalendarParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * Normalizes an AQHI-style timestamp. The API currently omits an offset, so
 * an absent offset is deliberately interpreted as Hong Kong time (+08:00),
 * never as the server or browser's local timezone.
 */
export function normalizeHktTimestamp(timestamp: string): string | null {
  const match = HKT_TIMESTAMP_PATTERN.exec(timestamp.trim());

  if (!match) {
    return null;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction = "",
    rawOffset,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");

  if (!isValidCalendarParts(year, month, day, hour, minute, second)) {
    return null;
  }

  const seconds = secondText === undefined ? ":00" : `:${secondText}`;
  const offset = rawOffset
    ? rawOffset.toUpperCase() === "Z"
      ? "Z"
      : rawOffset.includes(":")
        ? rawOffset
        : `${rawOffset.slice(0, 3)}:${rawOffset.slice(3)}`
    : "+08:00";

  return `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}${seconds}${fraction}${offset}`;
}

export function parseHktTimestamp(timestamp: string): Date | null {
  const normalized = normalizeHktTimestamp(timestamp);

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
