import type { LocationId } from "@/lib/location/districts";

export type MetricStatus =
  | "fresh"
  | "stale"
  | "missing"
  | "malformed"
  | "notApplicable"
  | "failed";

export interface NormalizedMetric<T> {
  status: MetricStatus;
  value: T | null;
  label: string;
  place: string | null;
  /** ISO timestamp used for comparison and display. */
  publishedAt: string | null;
  /** Exact source string, preserved for diagnostics. */
  rawPublishedAt: string | null;
  message: string;
}

export type SourceId =
  | "weather"
  | "warnings"
  | "forecast"
  | "aqhi"
  | "rainfallNowcast";
export type SourceStatus = "ok" | "stale" | "unavailable";

export const RAINFALL_NOWCAST_SIGNAL_MM = 0.5;

/**
 * Conservative trust-boundary limits for numeric weather data.
 *
 * These are plausibility guards, not scoring thresholds: Hong Kong records
 * remain well inside them. The 500 mm hourly ceiling is over twice the HKO's
 * published local one-hour extreme; the 250 mm half-hour ceiling preserves
 * the same maximum rate. Temperature keeps wide margins around Hong Kong's
 * observed climate, humidity follows its physical percentage bounds, UV 50
 * covers reported terrestrial extremes, and AQHI 11 represents official 10+.
 */
export const OUTLOOK_NUMERIC_RANGES = Object.freeze({
  rainfallMm: { min: 0, max: 500 },
  rainfallNowcastMm: { min: 0, max: 250 },
  temperatureC: { min: -10, max: 60 },
  humidityPercent: { min: 0, max: 100 },
  uvIndex: { min: 0, max: 50 },
  aqhi: { min: 1, max: 11 },
});

export interface SourceMeta {
  id: SourceId;
  label: string;
  url: string;
  status: SourceStatus;
  retrievedAt: string;
  publishedAt: string | null;
  rawPublishedAt: string | null;
  issues: string[];
}

export interface NormalizedWeather {
  conditionIcons: NormalizedMetric<number[]>;
  rainfallMm: NormalizedMetric<number>;
  temperatureC: NormalizedMetric<number>;
  humidityPercent: NormalizedMetric<number>;
  uvIndex: NormalizedMetric<number>;
  icons: number[];
  warningMessages: string[];
  specialWeatherTips: string[];
  source: SourceMeta;
}

export interface NormalizedWarning {
  family: string;
  code: string;
  name: string;
  actionCode: string;
  type: string | null;
  issueTime: string | null;
  updateTime: string | null;
  expireTime: string | null;
}

export interface NormalizedWarnings {
  items: NormalizedWarning[];
  /** False when validation had to discard at least one warning entry. */
  isSnapshotComplete: boolean;
  source: SourceMeta;
}

export interface NormalizedForecast {
  description: NormalizedMetric<string>;
  forecastPeriod: string | null;
  generalSituation: string | null;
  outlook: string | null;
  source: SourceMeta;
}

export interface NormalizedAqhiValue {
  value: number;
  display: string;
}

export interface NormalizedAqhi {
  aqhi: NormalizedMetric<NormalizedAqhiValue>;
  healthRisk: string | null;
  source: SourceMeta;
}

export interface RainfallNowcastPeriod {
  periodStartAt: string;
  periodEndAt: string;
  rainfallMm: number;
  isPartiallyElapsed: boolean;
}

export interface RainfallNowcastValue {
  periods: readonly [
    RainfallNowcastPeriod,
    RainfallNowcastPeriod,
    RainfallNowcastPeriod,
    RainfallNowcastPeriod,
  ];
  coverageEndAt: string;
  remainingCoverageMinutes: number;
  firstRainWindow: {
    firstPeriodIndex: number;
    lastPeriodIndex: number;
  } | null;
  peakRainPeriodIndex: number | null;
}

export interface NormalizedRainfallNowcast {
  forecast: NormalizedMetric<RainfallNowcastValue>;
  source: SourceMeta;
}

export interface OutlookLocation {
  id: LocationId;
  label: string;
  localized: boolean;
  note: string;
}

export type OverallDataStatus = "ok" | "partial" | "error";

export interface OutlookPayload {
  status: OverallDataStatus;
  generatedAt: string;
  location: OutlookLocation;
  weather: NormalizedWeather;
  warnings: NormalizedWarnings;
  forecast: NormalizedForecast;
  aqhi: NormalizedAqhi;
  rainfallNowcast: NormalizedRainfallNowcast;
  sources: SourceMeta[];
}
