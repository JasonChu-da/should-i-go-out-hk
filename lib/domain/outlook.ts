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

export type SourceId = "weather" | "warnings" | "forecast" | "aqhi";
export type SourceStatus = "ok" | "stale" | "unavailable";

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
  sources: SourceMeta[];
}
