import type { MetricStatus, NormalizedMetric } from "@/lib/domain/outlook";

const HKT_DATE_TIME = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const HKT_TIME = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatHktDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "未有時間";
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? HKT_DATE_TIME.format(date) : "時間格式異常";
}

export function formatHktTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "未有時間";
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? HKT_TIME.format(date) : "時間格式異常";
}

export const METRIC_STATUS_LABELS: Record<MetricStatus, string> = {
  fresh: "資料有效",
  stale: "可能已過時，不計分",
  missing: "暫無資料",
  malformed: "資料格式異常",
  notApplicable: "目前時段不適用",
  failed: "暫時無法取得",
};

export function metricTime<T>(metric: NormalizedMetric<T>): string {
  if (metric.status === "notApplicable") return metric.message;
  return metric.publishedAt
    ? `資料時間 ${formatHktDateTime(metric.publishedAt)}`
    : METRIC_STATUS_LABELS[metric.status];
}

export function translateAqhiRisk(risk: string | null): string {
  const labels: Record<string, string> = {
    Low: "低",
    Moderate: "中",
    High: "高",
    "Very High": "甚高",
    Serious: "嚴重",
  };
  return risk ? (labels[risk] ?? "未能識別") : "未有資料";
}

export function uvRisk(value: number): string {
  if (value >= 11) return "極高";
  if (value >= 8) return "甚高";
  if (value >= 6) return "高";
  if (value >= 3) return "中等";
  return "低";
}
