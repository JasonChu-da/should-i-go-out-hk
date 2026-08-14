import { AppIcon } from "@/components/AppIcon";
import type {
  NormalizedForecast,
  NormalizedWarnings,
  NormalizedWeather,
} from "@/lib/domain/outlook";
import {
  formatHktDateTime,
  METRIC_STATUS_LABELS,
} from "@/lib/presentation/format";

interface ActiveWarningsProps {
  warnings: NormalizedWarnings;
}

export function ActiveWarnings({ warnings }: ActiveWarningsProps) {
  const unavailable =
    warnings.source.status !== "ok" || !warnings.isSnapshotComplete;
  const hasConfirmedWarnings =
    warnings.source.status === "ok" && warnings.items.length > 0;

  if (!unavailable && warnings.items.length === 0) return null;

  return (
    <section className="active-warnings" aria-labelledby="warning-heading">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">安全資訊</p>
          <h2 id="warning-heading">生效中的天氣警告</h2>
        </div>
      </div>

      {unavailable ? (
        <div className="warning-availability" role="alert">
          <span className="alert-icon" aria-hidden="true"><AppIcon name="alert" /></span>
          <div>
            <strong>未能完整確認目前天氣警告</strong>
            <p>
              {warnings.source.status === "stale"
                ? "警告快照可能已過時，舊警告不會用於計分。"
                : !warnings.isSnapshotComplete && warnings.source.status === "ok"
                  ? "部分警告項目格式異常，結果已限制在審慎級別。"
                  : "警告服務暫時不可用，結果已限制在審慎級別。"}
            </p>
          </div>
        </div>
      ) : null}

      {hasConfirmedWarnings ? (
        <ul className="warning-grid" aria-label="生效中的天氣警告">
          {warnings.items.map((warning) => (
            <li className="warning-tile" key={`${warning.family}-${warning.code}`}>
              <span className="warning-marker" aria-hidden="true"><AppIcon name="alert" /></span>
              <div>
                <strong>{warning.name}</strong>
                <p>
                  {warning.type ?? "現正生效"}
                  {warning.updateTime ? ` · 更新 ${formatHktDateTime(warning.updateTime)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface ForecastDetailsProps {
  forecast: NormalizedForecast;
  weather: NormalizedWeather;
}

export function ForecastDetails({ forecast, weather }: ForecastDetailsProps) {
  const supportingMessages = [...new Set([
    ...weather.specialWeatherTips,
    ...weather.warningMessages,
  ])];

  return (
    <details className="utility-details forecast-utility">
      <summary>
        <span className="utility-summary-icon" aria-hidden="true"><AppIcon name="sun" /></span>
        <span className="utility-summary-copy">
          <strong>本港預報與提示</strong>
          <small>
            {forecast.description.publishedAt
              ? `更新 ${formatHktDateTime(forecast.description.publishedAt)}`
              : "暫無更新時間"}
          </small>
        </span>
        <span className="utility-summary-action">查看<AppIcon name="chevron" /></span>
      </summary>
      <div className="utility-content">
        {forecast.description.value !== null ? (
          <>
            <p>{forecast.description.value}</p>
            {forecast.description.status !== "fresh" ? (
              <span className="metric-status" data-status={forecast.description.status}>
                {METRIC_STATUS_LABELS[forecast.description.status]}
              </span>
            ) : null}
          </>
        ) : (
          <p>{forecast.description.message}</p>
        )}
        {supportingMessages.length > 0 ? (
          <ul>
            {supportingMessages.map((message) => <li key={message}>{message}</li>)}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
