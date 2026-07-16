import type { NormalizedMetric, OutlookPayload } from "@/lib/domain/outlook";
import type {
  ActiveWarning,
  Evidence,
  ScoringInput,
} from "@/lib/scoring/types";

function metricToEvidence<T>(metric: NormalizedMetric<T>): Evidence<T> {
  if (metric.status === "fresh" && metric.value !== null) {
    return {
      status: "fresh",
      value: metric.value,
      publishedAt: metric.publishedAt,
    };
  }

  return {
    status: metric.status === "fresh" ? "missing" : metric.status,
    publishedAt: metric.publishedAt,
    reason: metric.message,
  };
}

export function toScoringInput(payload: OutlookPayload): ScoringInput {
  const warningEvidence: Evidence<ActiveWarning[]> =
    payload.warnings.source.status === "ok"
      ? {
          status: "fresh",
          value: payload.warnings.items.map((warning) => ({
            family: warning.family,
            code: warning.code,
            name: warning.name,
            actionCode: warning.actionCode,
          })),
          publishedAt: payload.warnings.source.retrievedAt,
        }
      : {
          status: payload.warnings.source.status === "stale" ? "stale" : "failed",
          publishedAt: payload.warnings.source.retrievedAt,
          reason:
            payload.warnings.source.status === "stale"
              ? "天氣警告快照可能已過時。"
              : "未能確認目前天氣警告。",
        };

  return {
    rainfallMm: metricToEvidence(payload.weather.rainfallMm),
    temperatureC: metricToEvidence(payload.weather.temperatureC),
    humidityPercent: metricToEvidence(payload.weather.humidityPercent),
    uvIndex: metricToEvidence(payload.weather.uvIndex),
    aqhi: metricToEvidence(payload.aqhi.aqhi),
    forecastDescription: metricToEvidence(payload.forecast.description),
    warnings: warningEvidence,
    warningsConfirmed:
      payload.warnings.source.status === "ok" &&
      payload.warnings.isSnapshotComplete,
  };
}
