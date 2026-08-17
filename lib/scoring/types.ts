import type { RainfallNowcastValue } from "@/lib/domain/outlook";
import type { LocationId } from "@/lib/location/districts";

export type ActivityMode = "general" | "exercise" | "laundry";

export const ACTIVITY_MODES: ReadonlyArray<{
  id: ActivityMode;
  label: string;
}> = [
  { id: "general", label: "一般外出" },
  { id: "exercise", label: "跑步／踩單車" },
  { id: "laundry", label: "晾衫" },
];

export type EvidenceUnavailableStatus =
  | "stale"
  | "missing"
  | "failed"
  | "malformed"
  | "notApplicable";

export type Evidence<T> =
  | {
      status: "fresh";
      value: T;
      publishedAt: string | null;
    }
  | {
      status: EvidenceUnavailableStatus;
      publishedAt?: string | null;
      reason?: string;
    };

export interface AqhiScoreValue {
  /** 11 represents the official `10+` band. */
  value: number;
  display: string;
}

export interface ActiveWarning {
  family: string;
  code: string;
  name: string;
  actionCode?: string;
}

export interface ScoringInput {
  generatedAt: string;
  location: { id: LocationId; label: string };
  rainfallMm: Evidence<number>;
  rainfallNowcast: Evidence<RainfallNowcastValue>;
  temperatureC: Evidence<number>;
  humidityPercent: Evidence<number>;
  uvIndex: Evidence<number>;
  aqhi: Evidence<AqhiScoreValue>;
  forecastDescription: Evidence<string>;
  warnings: Evidence<ActiveWarning[]>;
  /** False when one or more warning entries could not be validated. */
  warningsConfirmed: boolean;
}

export interface ScoreFactor {
  id: string;
  label: string;
  detail: string;
  penalty: number;
  cap: number | null;
  priority: number;
  recommendation: string | null;
}

export interface IgnoredFactor {
  id: string;
  label: string;
  status: EvidenceUnavailableStatus;
  message: string;
}

export type Verdict = "suitable" | "prepare" | "avoid" | "unavailable";

export interface ScoringResult {
  score: number | null;
  verdict: Verdict;
  verdictLabel: string;
  summary: string;
  recommendations: string[];
  factors: ScoreFactor[];
  ignoredFactors: IgnoredFactor[];
  isLimited: boolean;
}
