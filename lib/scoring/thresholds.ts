import type { ActivityMode } from "./types";

export type ModeValues = Readonly<Record<ActivityMode, number>>;

export interface NumericThreshold {
  min: number;
  penalties: ModeValues;
}

const modeValues = (general: number, exercise: number, laundry: number): ModeValues => ({
  general,
  exercise,
  laundry,
});

/** Descending rules; only the first matching bucket applies. */
export const RAINFALL_THRESHOLDS: readonly NumericThreshold[] = [
  { min: 30, penalties: modeValues(9, 10, 10) },
  { min: 10, penalties: modeValues(7, 8, 10) },
  { min: 2.5, penalties: modeValues(3, 4, 9) },
  { min: Number.MIN_VALUE, penalties: modeValues(1, 2, 7) },
];

export const TEMPERATURE_THRESHOLDS: readonly NumericThreshold[] = [
  { min: 35, penalties: modeValues(5, 8, 0) },
  { min: 33, penalties: modeValues(3, 6, 0) },
  { min: 30, penalties: modeValues(1, 3, 0) },
  { min: 28, penalties: modeValues(1, 2, 0) },
];

export const HUMIDITY_THRESHOLDS: readonly NumericThreshold[] = [
  { min: 95, penalties: modeValues(0, 3, 5) },
  { min: 85, penalties: modeValues(0, 2, 3) },
  { min: 70, penalties: modeValues(0, 0, 1) },
];

export const UV_THRESHOLDS: readonly NumericThreshold[] = [
  { min: 11, penalties: modeValues(3, 6, 0) },
  { min: 8, penalties: modeValues(2, 4, 0) },
  { min: 6, penalties: modeValues(1, 2, 0) },
  { min: 3, penalties: modeValues(0, 1, 0) },
];

export const AQHI_THRESHOLDS: readonly NumericThreshold[] = [
  { min: 11, penalties: modeValues(5, 10, 0) },
  { min: 8, penalties: modeValues(3, 7, 0) },
  { min: 7, penalties: modeValues(1, 3, 0) },
  { min: 4, penalties: modeValues(0, 1, 0) },
];

export interface WarningRule {
  penalties: ModeValues;
  cap?: number;
  recommendation: string;
}

const STAY_INDOORS = "留在安全室內，並遵從香港天文台及政府的最新指示。";

export const WARNING_RULES: Readonly<Record<string, WarningRule>> = {
  WRAINB: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  TC8NE: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  TC8SE: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  TC8NW: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  TC8SW: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  TC9: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  TC10: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  WTMW: { penalties: modeValues(0, 0, 0), cap: 1, recommendation: STAY_INDOORS },
  WRAINR: {
    penalties: modeValues(7, 8, 9),
    recommendation: "避免不必要的戶外活動，留意水浸及交通情況。",
  },
  WRAINA: {
    penalties: modeValues(4, 6, 7),
    recommendation: "帶傘並預留交通時間；戶外運動或晾衫宜改期。",
  },
  WTS: {
    penalties: modeValues(4, 7, 7),
    recommendation: "雷暴期間遠離空曠地方、高地及水邊。",
  },
  TC3: {
    penalties: modeValues(4, 7, 5),
    recommendation: "避免踩單車，並遠離棚架、招牌及當風位置。",
  },
  TC1: {
    penalties: modeValues(1, 2, 1),
    recommendation: "留意熱帶氣旋最新消息，出門前再檢查交通安排。",
  },
  WMSGNL: {
    penalties: modeValues(3, 5, 3),
    recommendation: "避開當風位置；踩單車及高地活動宜改期。",
  },
  WHOT: {
    penalties: modeValues(3, 5, 0),
    recommendation: "補充水分、減少曝曬，避免長時間高強度活動。",
  },
  WCOLD: {
    penalties: modeValues(3, 3, 1),
    recommendation: "穿著足夠禦寒衣物，留意長者及慢性病患者。",
  },
  WFNTSA: {
    penalties: modeValues(3, 5, 3),
    recommendation: "新界北部可能水浸，遠離河道及低窪地方。",
  },
  WL: {
    penalties: modeValues(3, 5, 2),
    recommendation: "避免斜坡、山徑及可能有山泥傾瀉風險的地方。",
  },
  WFROST: {
    penalties: modeValues(1, 2, 1),
    recommendation: "新界北部及高地注意低溫與路面結冰風險。",
  },
  WFIREY: {
    penalties: modeValues(0, 1, 0),
    recommendation: "郊外活動切勿生火，並小心處理火種。",
  },
  WFIRER: {
    penalties: modeValues(1, 2, 0),
    recommendation: "避免郊外生火，並提高山火警覺。",
  },
};

export const SCORE_CAPS = {
  incompleteEvidence: 7,
  warningUnavailable: 7,
  warningSnapshotIncomplete: 3,
  unknownWarning: 3,
} as const;

export const FORECAST_RAIN_PATTERNS = {
  heavy: ["雨勢較大", "雨勢頗大", "大雨", "暴雨", "狂風雷暴"],
  showers: ["驟雨", "有雨", "雷雨", "雷暴"],
  negative: ["沒有雨", "無雨"],
} as const;

export function getPenalty(
  thresholds: readonly NumericThreshold[],
  value: number,
  mode: ActivityMode,
): number {
  return thresholds.find((threshold) => value >= threshold.min)?.penalties[mode] ?? 0;
}

export function getForecastRainLevel(text: string): "heavy" | "showers" | null {
  const normalized = FORECAST_RAIN_PATTERNS.negative.reduce(
    (result, phrase) => result.replaceAll(phrase, ""),
    text,
  );

  if (FORECAST_RAIN_PATTERNS.heavy.some((phrase) => normalized.includes(phrase))) {
    return "heavy";
  }

  if (FORECAST_RAIN_PATTERNS.showers.some((phrase) => normalized.includes(phrase))) {
    return "showers";
  }

  return null;
}
