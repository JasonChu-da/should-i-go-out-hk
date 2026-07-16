import { HKO_WARNING_SUMMARY_ENDPOINT } from "@/lib/api/endpoints";
import type {
  NormalizedWarning,
  NormalizedWarnings,
  SourceStatus,
} from "@/lib/domain/outlook";
import {
  FRESHNESS_THRESHOLDS_MS,
  assessFreshness,
} from "@/lib/freshness";
import { normalizeHkoTimestamp } from "@/lib/normalization/shared";
import type { HkoWarningSummary } from "@/lib/validation/hko";

function sourceStatusForSnapshot(
  retrievedAt: string | null,
  now: Date,
): SourceStatus {
  const freshness = assessFreshness(
    retrievedAt,
    now,
    FRESHNESS_THRESHOLDS_MS.warnings,
  );

  if (freshness === "fresh") return "ok";
  if (freshness === "stale") return "stale";
  return "unavailable";
}

function normalizeOptionalWarningTime(
  family: string,
  field: "issueTime" | "updateTime" | "expireTime",
  raw: string | undefined,
  issues: string[],
): string | null {
  if (raw === undefined) return null;

  const normalized = normalizeHkoTimestamp(raw);
  if (!normalized) {
    issues.push(`警告 ${family} 的 ${field} 時間無效。`);
  }
  return normalized;
}

/**
 * A successful warnsum response is an active-warning snapshot. Its freshness
 * is therefore based only on retrieval time; an active warning may correctly
 * have an old issue/update time.
 */
export function normalizeWarnings(
  value: HkoWarningSummary,
  retrievedAt: string,
  now: Date,
): NormalizedWarnings {
  const issues: string[] = [];
  const normalizedRetrievedAt = normalizeHkoTimestamp(retrievedAt);
  const sourceStatus = sourceStatusForSnapshot(normalizedRetrievedAt, now);

  if (!normalizedRetrievedAt) {
    issues.push("警告快照的擷取時間無效。");
  } else {
    const snapshotFreshness = assessFreshness(
      normalizedRetrievedAt,
      now,
      FRESHNESS_THRESHOLDS_MS.warnings,
    );
    if (snapshotFreshness === "future") {
      issues.push("警告快照的擷取時間明顯在未來。");
    }
  }

  const items: NormalizedWarning[] = [];
  let latestPublishedAt: string | null = null;
  let latestRawPublishedAt: string | null = null;

  for (const [family, warning] of Object.entries(value)) {
    if (warning.actionCode.trim().toUpperCase() === "CANCEL") {
      continue;
    }

    const issueTime = normalizeOptionalWarningTime(
      family,
      "issueTime",
      warning.issueTime,
      issues,
    );
    const updateTime = normalizeOptionalWarningTime(
      family,
      "updateTime",
      warning.updateTime,
      issues,
    );
    const expireTime = normalizeOptionalWarningTime(
      family,
      "expireTime",
      warning.expireTime,
      issues,
    );

    if (
      expireTime !== null &&
      Number.isFinite(now.getTime()) &&
      Date.parse(expireTime) < now.getTime()
    ) {
      issues.push(`警告 ${family} 已超過有效時間，已排除此項。`);
      continue;
    }

    items.push({
      family,
      code: warning.code,
      name: warning.name,
      actionCode: warning.actionCode,
      type: warning.type ?? null,
      issueTime,
      updateTime,
      expireTime,
    });

    const candidatePublishedAt = updateTime ?? issueTime;
    if (
      candidatePublishedAt &&
      (!latestPublishedAt || Date.parse(candidatePublishedAt) > Date.parse(latestPublishedAt))
    ) {
      latestPublishedAt = candidatePublishedAt;
      latestRawPublishedAt = warning.updateTime ?? warning.issueTime ?? null;
    }
  }

  return {
    items,
    isSnapshotComplete: true,
    source: {
      id: "warnings",
      label: "香港天文台天氣警告",
      url: HKO_WARNING_SUMMARY_ENDPOINT,
      status: sourceStatus,
      retrievedAt,
      // An empty successful snapshot has no entry timestamp; retrieval time is
      // the only honest time at which "no active warning" was confirmed.
      publishedAt: latestPublishedAt ?? normalizedRetrievedAt,
      rawPublishedAt: latestRawPublishedAt ?? retrievedAt,
      issues,
    },
  };
}
