import type { OverallDataStatus, SourceMeta } from "@/lib/domain/outlook";

const CORE_SOURCE_IDS = new Set<SourceMeta["id"]>([
  "weather",
  "warnings",
  "forecast",
  "aqhi",
]);

export function classifyOverallStatus(sources: SourceMeta[]): OverallDataStatus {
  if (
    !sources.some(
      (source) =>
        CORE_SOURCE_IDS.has(source.id) && source.status === "ok",
    )
  ) {
    return "error";
  }
  if (
    sources.some(
      (source) => source.status !== "ok" || source.issues.length > 0,
    )
  ) {
    return "partial";
  }
  return "ok";
}
