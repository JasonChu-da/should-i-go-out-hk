import {
  AQHI_THRESHOLDS,
  getForecastRainLevel,
  getPenalty,
  HUMIDITY_THRESHOLDS,
  RAINFALL_THRESHOLDS,
  SCORE_CAPS,
  TEMPERATURE_THRESHOLDS,
  UV_THRESHOLDS,
  WARNING_RULES,
  type WarningRule,
} from "./thresholds";
import type {
  ActivityMode,
  ActiveWarning,
  Evidence,
  EvidenceUnavailableStatus,
  IgnoredFactor,
  ScoreFactor,
  ScoringInput,
  ScoringResult,
  Verdict,
} from "./types";

const MODE_LABELS: Record<ActivityMode, string> = {
  general: "一般外出",
  exercise: "跑步／踩單車",
  laundry: "晾衫",
};

const STATUS_LABELS: Record<EvidenceUnavailableStatus, string> = {
  stale: "資料可能已過時，因此沒有計分。",
  missing: "資料暫時未有提供，因此沒有計分。",
  failed: "資料暫時無法取得，因此沒有計分。",
  malformed: "資料格式異常，因此沒有計分。",
  notApplicable: "目前時段不適用。",
};

const isFresh = <T>(evidence: Evidence<T>): evidence is Extract<Evidence<T>, { status: "fresh" }> =>
  evidence.status === "fresh";

function createFactor(
  id: string,
  label: string,
  detail: string,
  penalty: number,
  priority: number,
  recommendation: string | null,
  cap: number | null = null,
): ScoreFactor {
  return { id, label, detail, penalty, cap, priority, recommendation };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function deriveWarningFamily(warning: ActiveWarning): string {
  if (warning.family) return warning.family;
  if (warning.code.startsWith("WRAIN")) return "WRAIN";
  if (warning.code.startsWith("TC")) return "WTCSGNL";
  if (warning.code.startsWith("WFIRE")) return "WFIRE";
  return warning.code;
}

function warningWeight(rule: WarningRule | undefined, mode: ActivityMode): number {
  if (!rule) return 70;
  if (rule.cap !== undefined) return 100 + (10 - rule.cap);
  return rule.penalties[mode];
}

function deduplicateWarnings(warnings: ActiveWarning[], mode: ActivityMode): ActiveWarning[] {
  const byFamily = new Map<string, ActiveWarning>();

  for (const warning of warnings) {
    if (warning.actionCode === "CANCEL") continue;
    const family = deriveWarningFamily(warning);
    const current = byFamily.get(family);
    if (!current) {
      byFamily.set(family, warning);
      continue;
    }

    const currentWeight = warningWeight(WARNING_RULES[current.code], mode);
    const candidateWeight = warningWeight(WARNING_RULES[warning.code], mode);
    if (candidateWeight > currentWeight) byFamily.set(family, warning);
  }

  return [...byFamily.values()];
}

function addIgnored(
  ignored: IgnoredFactor[],
  id: string,
  label: string,
  evidence: Evidence<unknown>,
): void {
  if (evidence.status === "fresh" || evidence.status === "notApplicable") return;
  ignored.push({
    id,
    label,
    status: evidence.status,
    message: evidence.reason ?? STATUS_LABELS[evidence.status],
  });
}

function verdictForScore(score: number): { verdict: Verdict; label: string } {
  if (score >= 8) return { verdict: "suitable", label: "適合出門" };
  if (score >= 4) return { verdict: "prepare", label: "可以出門，但需要準備" };
  return { verdict: "avoid", label: "不建議戶外活動" };
}

function unavailableResult(ignoredFactors: IgnoredFactor[]): ScoringResult {
  return {
    score: null,
    verdict: "unavailable",
    verdictLabel: "資料不足，暫未能評分",
    summary: "目前沒有足夠的新鮮資料評估這個模式。",
    recommendations: ["請稍後重試，並查看香港天文台的最新天氣及警告。"],
    factors: [],
    ignoredFactors,
    isLimited: true,
  };
}

export function scoreOutlook(input: ScoringInput, mode: ActivityMode): ScoringResult {
  const factors: ScoreFactor[] = [];
  const ignoredFactors: IgnoredFactor[] = [];
  let relevantFreshCount = 0;

  const applyRainfall = (): void => {
    if (isFresh(input.rainfallMm)) {
      relevantFreshCount += 1;
      const value = input.rainfallMm.value;
      const penalty = value > 0 ? getPenalty(RAINFALL_THRESHOLDS, value, mode) : 0;
      if (penalty > 0) {
        const recommendation =
          mode === "laundry"
            ? "過去一小時有雨，改在室內晾衫或延後再晾。"
            : mode === "exercise"
              ? "路面可能濕滑，戶外運動宜改期或縮短。"
              : "帶傘並預留較多交通時間。";
        factors.push(
          createFactor(
            "rainfall",
            "過去一小時錄得雨量",
            `錄得 ${formatNumber(value)} 毫米雨量，${MODE_LABELS[mode]}扣 ${penalty} 分。`,
            penalty,
            700 + penalty,
            recommendation,
          ),
        );
      }
    } else {
      addIgnored(ignoredFactors, "rainfall", "雨量", input.rainfallMm);
    }
  };

  const applyTemperature = (): void => {
    if (isFresh(input.temperatureC)) {
      relevantFreshCount += 1;
      const value = input.temperatureC.value;
      const penalty = getPenalty(TEMPERATURE_THRESHOLDS, value, mode);
      if (penalty > 0) {
        factors.push(
          createFactor(
            "temperature",
            "天氣炎熱",
            `氣溫 ${formatNumber(value)}°C，${MODE_LABELS[mode]}扣 ${penalty} 分。`,
            penalty,
            500 + penalty,
            "補充水分、減少曝曬，感到不適便到陰涼地方休息。",
          ),
        );
      }
    } else {
      addIgnored(ignoredFactors, "temperature", "氣溫", input.temperatureC);
    }
  };

  const applyHumidity = (): void => {
    if (isFresh(input.humidityPercent)) {
      relevantFreshCount += 1;
      const value = input.humidityPercent.value;
      const penalty = getPenalty(HUMIDITY_THRESHOLDS, value, mode);
      if (penalty > 0) {
        factors.push(
          createFactor(
            "humidity",
            "濕度偏高",
            `相對濕度 ${formatNumber(value)}%，${MODE_LABELS[mode]}扣 ${penalty} 分。`,
            penalty,
            450 + penalty,
            mode === "laundry"
              ? "空氣潮濕，改在室內通風位置晾衫並預留更長時間。"
              : "空氣潮濕，降低活動強度並多休息。",
          ),
        );
      }
    } else {
      addIgnored(ignoredFactors, "humidity", "濕度", input.humidityPercent);
    }
  };

  applyRainfall();

  if (mode !== "laundry") applyTemperature();
  if (mode === "exercise" || mode === "laundry") applyHumidity();

  if (
    mode !== "laundry" &&
    isFresh(input.temperatureC) &&
    isFresh(input.humidityPercent) &&
    input.temperatureC.value >= 33 &&
    input.humidityPercent.value >= 85
  ) {
    const penalty = mode === "exercise" ? 2 : 1;
    factors.push(
      createFactor(
        "heat-humidity",
        "又熱又潮濕",
        `高溫與高濕度同時出現，額外扣 ${penalty} 分。`,
        penalty,
        560 + penalty,
        "降低活動強度、補充水分，並安排更多陰涼處休息。",
      ),
    );
  }

  if (mode !== "laundry") {
    if (isFresh(input.uvIndex)) {
      relevantFreshCount += 1;
      const value = input.uvIndex.value;
      const penalty = getPenalty(UV_THRESHOLDS, value, mode);
      if (penalty > 0) {
        factors.push(
          createFactor(
            "uv",
            "紫外線偏高",
            `紫外線指數 ${formatNumber(value)}，長時間曝曬風險上升，扣 ${penalty} 分。`,
            penalty,
            400 + penalty,
            "使用防曬、戴帽並盡量在有遮蔭的地方活動。",
          ),
        );
      }
    } else {
      addIgnored(ignoredFactors, "uv", "紫外線", input.uvIndex);
    }

    if (isFresh(input.aqhi)) {
      relevantFreshCount += 1;
      const { value, display } = input.aqhi.value;
      const penalty = getPenalty(AQHI_THRESHOLDS, value, mode);
      if (penalty > 0) {
        factors.push(
          createFactor(
            "aqhi",
            "空氣污染健康風險上升",
            `AQHI ${display}，${MODE_LABELS[mode]}扣 ${penalty} 分。`,
            penalty,
            600 + penalty,
            "減少戶外劇烈活動；容易受空氣污染影響的人士應格外留意。",
          ),
        );
      }
    } else {
      addIgnored(ignoredFactors, "aqhi", "空氣質素", input.aqhi);
    }
  }

  if (mode === "laundry") {
    if (isFresh(input.forecastDescription)) {
      relevantFreshCount += 1;
      const rainLevel = getForecastRainLevel(input.forecastDescription.value);
      if (rainLevel) {
        const penalty = rainLevel === "heavy" ? 7 : 3;
        factors.push(
          createFactor(
            "forecast-rain",
            rainLevel === "heavy" ? "預報雨勢較大" : "預報有驟雨或雷暴",
            `本港預報明確提及雨勢，晾衫扣 ${penalty} 分。`,
            penalty,
            350 + penalty,
            "預報有雨，改在室內晾衫或延後再晾。",
          ),
        );
      }
    } else {
      addIgnored(ignoredFactors, "forecast", "本港天氣預報", input.forecastDescription);
    }
  }

  if (isFresh(input.warnings)) {
    const warnings = deduplicateWarnings(input.warnings.value, mode);
    if (warnings.length > 0) relevantFreshCount += 1;

    for (const warning of warnings) {
      const rule = WARNING_RULES[warning.code];
      if (!rule) {
        factors.push(
          createFactor(
            `warning-${warning.code}`,
            warning.name || "未能識別的生效警告",
            "有未能識別的生效警告，分數最高為 3。",
            0,
            1000,
            "先查看香港天文台的最新警告詳情，再決定是否外出。",
            SCORE_CAPS.unknownWarning,
          ),
        );
        continue;
      }

      const penalty = rule.penalties[mode];
      const cap = rule.cap ?? null;
      factors.push(
        createFactor(
          `warning-${warning.code}`,
          warning.name,
          cap === null
            ? `${warning.name}現正生效，${MODE_LABELS[mode]}扣 ${penalty} 分。`
            : `${warning.name}現正生效，分數最高為 ${cap}。`,
          penalty,
          cap === null ? 800 + penalty : 1100,
          rule.recommendation,
          cap,
        ),
      );
    }

    if (!input.warningsConfirmed) {
      factors.push(
        createFactor(
          "warning-snapshot-incomplete",
          "未能完整確認目前天氣警告",
          "至少一項警告資料格式異常，分數最高為 3。",
          0,
          1060,
          "先查看香港天文台的最新警告詳情，再決定是否外出。",
          SCORE_CAPS.warningSnapshotIncomplete,
        ),
      );
    }
  } else {
    addIgnored(ignoredFactors, "warnings", "天氣警告", input.warnings);
    factors.push(
      createFactor(
        "warning-unavailable",
        "未能確認目前天氣警告",
        "警告資料未能確認，以下只按可用資料評估，分數最高為 7。",
        0,
        1050,
        "先查看香港天文台的最新警告，再決定是否外出。",
        SCORE_CAPS.warningUnavailable,
      ),
    );
  }

  const unavailableNonWarningFactors = ignoredFactors.filter(
    (factor) => factor.id !== "warnings",
  );
  if (unavailableNonWarningFactors.length > 0) {
    factors.push(
      createFactor(
        "incomplete-evidence",
        "部分評估資料未能使用",
        `有 ${unavailableNonWarningFactors.length} 項相關資料缺失、異常或過時，分數最高為 7。`,
        0,
        350,
        "結果只按已確認資料評估；請稍後重試並留意官方最新資料。",
        SCORE_CAPS.incompleteEvidence,
      ),
    );
  }

  if (relevantFreshCount === 0) return unavailableResult(ignoredFactors);

  const totalPenalty = factors.reduce((sum, factor) => sum + factor.penalty, 0);
  const rawScore = Math.max(0, Math.min(10, 10 - totalPenalty));
  const caps = factors.flatMap((factor) => (factor.cap === null ? [] : [factor.cap]));
  const score = Math.min(rawScore, ...caps, 10);
  const sortedFactors = [...factors].sort(
    (left, right) => right.priority - left.priority || right.penalty - left.penalty,
  );
  const primaryFactor = sortedFactors[0];
  const recommendations = [...new Set(sortedFactors.flatMap((factor) => factor.recommendation ?? []))].slice(
    0,
    3,
  );

  if (recommendations.length === 0) {
    recommendations.push("可按原定計劃安排，出門前仍請留意短時間天氣變化。");
  }

  const verdict = verdictForScore(score);
  return {
    score,
    verdict: verdict.verdict,
    verdictLabel: verdict.label,
    summary: primaryFactor?.detail ?? "現有已確認資料未見明顯不利因素。",
    recommendations,
    factors: sortedFactors,
    ignoredFactors,
    isLimited:
      ignoredFactors.length > 0 ||
      !isFresh(input.warnings) ||
      !input.warningsConfirmed,
  };
}
