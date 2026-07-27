import {
  failure,
  isFiniteNumber,
  isRecord,
  issue,
  success,
  type ParseResult,
  type ValidationIssue,
} from "./common";

export const AQHI_HEALTH_RISKS = [
  "Low",
  "Moderate",
  "High",
  "Very High",
  "Serious",
] as const;

export type AqhiHealthRisk = (typeof AQHI_HEALTH_RISKS)[number];
export type AqhiNumericValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type AqhiStringValue =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "10+";
export type AqhiValue = AqhiNumericValue | AqhiStringValue;

export interface AqhiStationReading {
  station: string;
  aqhi: AqhiValue;
  health_risk: AqhiHealthRisk;
  publish_date: string;
}

export type AqhiResponse = AqhiStationReading[];

const AQHI_HEALTH_RISK_BY_LOWERCASE: Readonly<
  Record<string, AqhiHealthRisk>
> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  "very high": "Very High",
  serious: "Serious",
};

function parseAqhiHealthRisk(value: unknown): AqhiHealthRisk | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return AQHI_HEALTH_RISK_BY_LOWERCASE[value.toLowerCase()];
}

function isAqhiValue(value: unknown): value is AqhiValue {
  if (isFiniteNumber(value)) {
    return Number.isInteger(value) && value >= 1 && value <= 10;
  }

  return (
    typeof value === "string" &&
    (value === "10+" || /^(?:[1-9]|10)$/.test(value))
  );
}

function parseAqhiItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AqhiStationReading | undefined {
  if (!isRecord(value)) {
    issue(issues, path, "預期為 AQHI 站點物件，已排除此列");
    return undefined;
  }

  let valid = true;
  const healthRisk = parseAqhiHealthRisk(value.health_risk);
  if (typeof value.station !== "string") {
    issue(issues, `${path}.station`, "預期為字串");
    valid = false;
  }
  if (!isAqhiValue(value.aqhi)) {
    issue(issues, `${path}.aqhi`, "預期為 1 至 10、數字字串或 10+");
    valid = false;
  }
  if (healthRisk === undefined) {
    issue(issues, `${path}.health_risk`, "不是官方 AQHI 健康風險級別");
    valid = false;
  }
  if (typeof value.publish_date !== "string") {
    issue(issues, `${path}.publish_date`, "預期為原始發布時間字串");
    valid = false;
  }

  if (!valid || healthRisk === undefined) {
    issue(issues, path, "AQHI 列格式錯誤，已排除");
    return undefined;
  }

  return {
    station: value.station as string,
    aqhi: value.aqhi as AqhiValue,
    health_risk: healthRisk,
    publish_date: value.publish_date as string,
  };
}

export function parseAqhi(input: unknown): ParseResult<AqhiResponse> {
  if (!Array.isArray(input)) {
    return failure("$", "AQHI 根節點必須是陣列");
  }

  const issues: ValidationIssue[] = [];
  const readings: AqhiResponse = [];
  input.forEach((item, index) => {
    const reading = parseAqhiItem(item, `$[${index}]`, issues);
    if (reading !== undefined) {
      readings.push(reading);
    }
  });

  return success(readings, issues);
}
