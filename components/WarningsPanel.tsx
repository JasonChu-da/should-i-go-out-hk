import type {
  NormalizedForecast,
  NormalizedWarnings,
  NormalizedWeather,
} from "@/lib/domain/outlook";
import { formatHktDateTime, METRIC_STATUS_LABELS } from "@/lib/presentation/format";

interface WarningsPanelProps {
  warnings: NormalizedWarnings;
  forecast: NormalizedForecast;
  weather: NormalizedWeather;
}

export function WarningsPanel({ warnings, forecast, weather }: WarningsPanelProps) {
  const warningUnavailable =
    warnings.source.status !== "ok" || !warnings.isSnapshotComplete;
  const supportingMessages = [...weather.specialWeatherTips, ...weather.warningMessages];

  return (
    <section className="warning-section" aria-labelledby="warning-heading">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">安全先行</p>
          <h2 id="warning-heading">天氣警告與本港預報</h2>
        </div>
      </div>

      {warningUnavailable ? (
        <div className="alert-box" data-level="warning" role="alert">
          <strong><span aria-hidden="true">!</span> 未能確認目前天氣警告</strong>
          <p>{warnings.source.status === "stale" ? "警告快照可能已過時，舊警告不會用於計分。" : !warnings.isSnapshotComplete && warnings.source.status === "ok" ? "部分警告項目格式異常，結果已限制在審慎級別；下方只列出能確認的警告。" : "警告服務暫時不可用，結果已限制在審慎級別。"}</p>
        </div>
      ) : null}

      {warnings.items.length > 0 ? (
        <ul className="active-warning-list" aria-label="生效中的天氣警告">
          {warnings.items.map((warning) => (
            <li key={`${warning.family}-${warning.code}`}>
              <span className="warning-marker" aria-hidden="true">!</span>
              <div>
                <strong>{warning.name}</strong>
                <p>{warning.type ?? "現正生效"}{warning.updateTime ? ` · 更新 ${formatHktDateTime(warning.updateTime)}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : !warningUnavailable ? (
        <div className="alert-box" data-level="clear" role="status">
          <strong><span aria-hidden="true">✓</span> 最近一次查詢未見生效警告</strong>
          <p>這不等同安全保證；短時間天氣仍可能改變。</p>
        </div>
      ) : null}

      {supportingMessages.length > 0 ? (
        <div className="weather-tips">
          <h3>天文台提示</h3>
          <ul>{supportingMessages.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      ) : null}

      <article className="forecast-card">
        <h3>本港地區預報</h3>
        {forecast.description.value !== null ? (
          <>
            <p>{forecast.description.value}</p>
            {forecast.description.status !== "fresh" ? <span className="metric-status" data-status={forecast.description.status}>{METRIC_STATUS_LABELS[forecast.description.status]}</span> : null}
          </>
        ) : (
          <p className="muted-copy">{forecast.description.message}</p>
        )}
        <p className="metric-meta">{forecast.description.publishedAt ? `更新 ${formatHktDateTime(forecast.description.publishedAt)}` : "暫無來源更新時間"}</p>
      </article>
    </section>
  );
}
