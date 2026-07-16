import { HKO_LOCAL_FORECAST_ENDPOINT } from "@/lib/api/endpoints";
import type { NormalizedForecast } from "@/lib/domain/outlook";
import { FRESHNESS_THRESHOLDS_MS } from "@/lib/freshness";
import {
  createSourceMeta,
  createTimedMetric,
  deriveSourceStatus,
  normalizeHkoTimestamp,
} from "@/lib/normalization/shared";
import type { HkoLocalForecast } from "@/lib/validation/hko";

function nonEmptyText(value: string | undefined): string | null {
  return value !== undefined && value.trim() !== "" ? value : null;
}

export function normalizeForecast(
  value: HkoLocalForecast,
  retrievedAt: string,
  now: Date,
): NormalizedForecast {
  const rawPublishedAt = value.updateTime ?? null;
  const normalizedPublishedAt = normalizeHkoTimestamp(value.updateTime);
  const descriptionText = nonEmptyText(value.forecastDesc);
  const description = createTimedMetric({
    value: descriptionText,
    label: "本港天氣預報",
    rawPublishedAt,
    normalizedPublishedAt,
    now,
    maxAge: FRESHNESS_THRESHOLDS_MS.forecast,
  });
  const sourceStatus = deriveSourceStatus([description]);
  const issues: string[] = [];

  if (descriptionText === null) {
    issues.push("本港天氣預報描述缺失。");
  } else if (normalizedPublishedAt === null) {
    issues.push("本港天氣預報更新時間缺失或無效。");
  }

  return {
    description,
    forecastPeriod: nonEmptyText(value.forecastPeriod),
    generalSituation: nonEmptyText(value.generalSituation),
    outlook: nonEmptyText(value.outlook),
    source: createSourceMeta(
      {
        id: "forecast",
        label: "香港天文台本港天氣預報",
        url: HKO_LOCAL_FORECAST_ENDPOINT,
        retrievedAt,
      },
      sourceStatus,
      [description],
      issues,
    ),
  };
}
