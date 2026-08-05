import type { OutlookPayload } from "@/lib/domain/outlook";

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function timestampValue(timestamp: string | null): number | null {
  if (!timestamp || !ISO_TIMESTAMP.test(timestamp)) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

export function latestPublishedAt(payload: OutlookPayload): string | null {
  let latest: string | null = null;
  let latestValue = Number.NEGATIVE_INFINITY;

  for (const source of payload.sources) {
    // Warning normalization falls back to retrievedAt when no entry has an
    // official issue/update time; that confirmation time is not a publication.
    if (
      source.id === "warnings" &&
      source.publishedAt === source.retrievedAt &&
      source.rawPublishedAt === source.retrievedAt
    ) {
      continue;
    }
    const value = timestampValue(source.publishedAt);
    if (value !== null && value > latestValue) {
      latest = source.publishedAt;
      latestValue = value;
    }
  }

  return latest;
}
