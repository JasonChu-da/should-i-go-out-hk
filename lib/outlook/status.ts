import type { OverallDataStatus, SourceMeta } from "@/lib/domain/outlook";

export function classifyOverallStatus(sources: SourceMeta[]): OverallDataStatus {
  if (!sources.some((source) => source.status === "ok")) return "error";
  if (
    sources.some(
      (source) => source.status !== "ok" || source.issues.length > 0,
    )
  ) {
    return "partial";
  }
  return "ok";
}

