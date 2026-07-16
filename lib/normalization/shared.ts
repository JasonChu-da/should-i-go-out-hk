import type {
  MetricStatus,
  NormalizedMetric,
  SourceMeta,
  SourceStatus,
} from "@/lib/domain/outlook";
import {
  assessFreshness,
  normalizeHktTimestamp,
  type FreshnessStatus,
} from "@/lib/freshness";

const HKO_TIMESTAMP_WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function normalizeHkoTimestamp(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!HKO_TIMESTAMP_WITH_ZONE.test(trimmed)) return null;

  // Reuse the strict calendar validation used for AQHI, but still require the
  // explicit offset supplied by HKO. This rejects dates such as 30 February
  // that Date.parse would otherwise silently roll into March.
  const normalized = normalizeHktTimestamp(trimmed);
  if (!normalized) return null;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function freshnessToMetricStatus(status: FreshnessStatus): MetricStatus {
  if (status === "fresh") return "fresh";
  if (status === "stale") return "stale";
  return "malformed";
}

export function createTimedMetric<T>({
  value,
  label,
  place = null,
  rawPublishedAt,
  normalizedPublishedAt,
  now,
  maxAge,
}: {
  value: T | null;
  label: string;
  place?: string | null;
  rawPublishedAt: string | null;
  normalizedPublishedAt: string | null;
  now: Date;
  maxAge: number;
}): NormalizedMetric<T> {
  if (value === null) {
    return {
      status: "missing",
      value: null,
      label,
      place,
      publishedAt: normalizedPublishedAt,
      rawPublishedAt,
      message: "資料暫時未有提供。",
    };
  }

  const freshness = assessFreshness(normalizedPublishedAt, now, maxAge);
  const status = freshnessToMetricStatus(freshness);
  return {
    status,
    value: status === "malformed" ? null : value,
    label,
    place,
    publishedAt: normalizedPublishedAt,
    rawPublishedAt,
    message:
      status === "fresh"
        ? "資料在可接受更新時間內。"
        : status === "stale"
          ? "資料可能已過時，不會用於計分。"
          : "資料時間無效，不會用於計分。",
  };
}

export function createUnavailableMetric<T>(
  label: string,
  status: Extract<MetricStatus, "missing" | "malformed" | "notApplicable" | "failed">,
  message: string,
  place: string | null = null,
): NormalizedMetric<T> {
  return {
    status,
    value: null,
    label,
    place,
    publishedAt: null,
    rawPublishedAt: null,
    message,
  };
}

export function deriveSourceStatus(metrics: NormalizedMetric<unknown>[]): SourceStatus {
  if (metrics.some((metric) => metric.status === "fresh" || metric.status === "notApplicable")) {
    return "ok";
  }
  if (metrics.some((metric) => metric.status === "stale")) return "stale";
  return "unavailable";
}

export function createSourceMeta(
  base: Omit<SourceMeta, "status" | "publishedAt" | "rawPublishedAt" | "issues">,
  status: SourceStatus,
  metrics: NormalizedMetric<unknown>[],
  issues: string[] = [],
): SourceMeta {
  const timestamps = metrics
    .filter((metric) => metric.publishedAt)
    .sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""));
  const latest = timestamps[0];
  return {
    ...base,
    status,
    publishedAt: latest?.publishedAt ?? null,
    rawPublishedAt: latest?.rawPublishedAt ?? null,
    issues,
  };
}
