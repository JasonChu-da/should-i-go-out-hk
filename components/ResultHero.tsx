import type { ActivityMode, ScoringResult } from "@/lib/scoring/types";

const MODE_COPY: Record<ActivityMode, string> = {
  general: "一般外出評估",
  exercise: "跑步／踩單車評估",
  laundry: "晾衫評估",
};

const VERDICT_SYMBOLS: Record<ScoringResult["verdict"], string> = {
  suitable: "✓",
  prepare: "!",
  avoid: "×",
  unavailable: "?",
};

interface ResultHeroProps {
  result: ScoringResult;
  mode: ActivityMode;
  dataLimited?: boolean;
}

export function ResultHero({ result, mode, dataLimited = false }: ResultHeroProps) {
  const limited = result.isLimited || dataLimited;
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
        <p className="eyebrow">{MODE_COPY[mode]}</p>
        {limited ? <span className="status-chip">資料有限</span> : <span className="status-chip">資料齊備</span>}
      </div>

      <div className="result-core">
        <p className="score-block">
          <span className="sr-only">{scoreLabel}</span>
          <span className="score-value" aria-hidden="true">{result.score ?? "—"}</span>
          <span className="score-total" aria-hidden="true">/ 10</span>
        </p>
        <div className="verdict-block">
          <h2 className="verdict" id="result-title" tabIndex={-1}>
            <span className="verdict-symbol" aria-hidden="true">
              {VERDICT_SYMBOLS[result.verdict]}
            </span>
            {result.verdictLabel}
          </h2>
          <p className="result-summary">{result.summary}</p>
        </div>
      </div>

      <ol className="recommendation-list" aria-label="行動建議">
        {result.recommendations.slice(0, 3).map((recommendation) => (
          <li key={recommendation}>{recommendation}</li>
        ))}
      </ol>

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
