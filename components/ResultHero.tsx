import type { ActivityMode, ScoringResult } from "@/lib/scoring/types";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

const MODE_COPY: Record<ActivityMode, string> = {
  general: "一般外出評估",
  exercise: "跑步／踩單車評估",
  laundry: "晾衫評估",
};

const VERDICT_ICONS: Record<ScoringResult["verdict"], AppIconName> = {
  suitable: "check",
  prepare: "alert",
  avoid: "close",
  unavailable: "help",
};

interface ResultHeroProps {
  result: ScoringResult;
  mode: ActivityMode;
}

export function ResultHero({ result, mode }: ResultHeroProps) {
  const limited = result.isLimited;
  const scoreLabel =
    result.score === null
      ? "暫未能評分"
      : `外出分數 ${result.score} 分，滿分 10 分`;

  return (
    <section className="result-hero" data-verdict={result.verdict} aria-labelledby="result-title">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {MODE_COPY[mode]}。{scoreLabel}。{result.verdictLabel}。{result.summary}
      </p>
      <div className="result-topline">
        <p className="result-mode">{MODE_COPY[mode]}</p>
        {limited ? <span className="status-chip" data-status="limited">資料有限</span> : <span className="status-chip" data-status="ready">資料齊備</span>}
      </div>

      <div className="result-core">
        <p className="score-block">
          <span className="sr-only">{scoreLabel}</span>
          <span className="score-caption" aria-hidden="true">外出分數</span>
          <span className="score-line" aria-hidden="true" key={result.score ?? "unavailable"}>
            <span className="score-value">{result.score ?? "—"}</span>
            <span className="score-total">/ 10</span>
          </span>
        </p>
        <div className="verdict-block">
          <h2 className="verdict" id="result-title" tabIndex={-1}>
            <span className="verdict-symbol" aria-hidden="true">
              <AppIcon name={VERDICT_ICONS[result.verdict]} />
            </span>
            {result.verdictLabel}
          </h2>
          <p className="result-summary">{result.summary}</p>
        </div>
      </div>

      {result.score !== null ? (
        <div
          className="score-gauge"
          role="progressbar"
          aria-label={`外出分數 ${result.score} 分`}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={result.score}
        >
          <span style={{ transform: `scaleX(${result.score / 10})` }} />
        </div>
      ) : null}

      <ul className="recommendation-list" aria-label="行動建議">
        {result.recommendations.slice(0, 3).map((recommendation) => (
          <li key={recommendation}>
            <span aria-hidden="true"><AppIcon name="check" /></span>
            {recommendation}
          </li>
        ))}
      </ul>

      <details className="score-details">
        <summary>
          查看計分原因
          {result.factors.length > 0 ? `（${result.factors.length} 項）` : ""}
        </summary>
        {result.factors.length > 0 ? (
          <ul className="factor-list">
            {result.factors.map((factor) => (
              <li key={factor.id}>
                <strong>{factor.label}</strong>
                <span>{factor.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>現有已確認資料沒有觸發扣分規則。</p>
        )}
        {result.ignoredFactors.length > 0 ? (
          <div className="ignored-data">
            <strong>未有計分的資料</strong>
            <ul>
              {result.ignoredFactors.map((factor) => (
                <li key={factor.id}>{factor.label}：{factor.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
    </section>
  );
}
