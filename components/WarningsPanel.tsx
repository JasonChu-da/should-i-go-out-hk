import { AppIcon } from "@/components/AppIcon";
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
          <p className="eyebrow">安全資訊</p>
          <h2 id="warning-heading">警告與本港預報</h2>
        </div>
      </div>

      {warningUnavailable ? (
        <div className="alert-box" data-level="warning" role="alert">
          <span className="alert-icon" aria-hidden="true"><AppIcon name="alert" /></span>
          <div>
            <strong>未能確認目前天氣警告</strong>
            <p>{warnings.source.status === "stale" ? "警告快照可能已過時，舊警告不會用於計分。" : !warnings.isSnapshotComplete && warnings.source.status === "ok" ? "部分警告項目格式異常，結果已限制在審慎級別。" : "警告服務暫時不可用，結果已限制在審慎級別。"}</p>
          </div>
        </div>
      ) : null}

      {warnings.items.length > 0 ? (
        <ul className="active-warning-list" aria-label="生效中的天氣警告">
          {warnings.items.map((warning) => (
            <li key={`${warning.family}-${warning.code}`}>
              <span className="warning-marker" aria-hidden="true"><AppIcon name="alert" /></span>
              <div>
                <strong>{warning.name}</strong>
                <p>{warning.type ?? "現正生效"}{warning.updateTime ? ` · 更新 ${formatHktDateTime(warning.updateTime)}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : !warningUnavailable ? (
        <div className="alert-box" data-level="clear" role="status">
          <span className="alert-icon" aria-hidden="true"><AppIcon name="check" /></span>
          <div>
            <strong>最近一次查詢未見生效警告</strong>
            <p>短時間天氣仍可能改變，出門前請留意現場情況。</p>
          </div>
        </div>
      ) : null}

      {supportingMessages.length > 0 ? (
        <details className="weather-tips">
          <summary>天文台提示（{supportingMessages.length} 項）<AppIcon name="chevron" /></summary>
          <ul>{supportingMessages.map((message) => <li key={message}>{message}</li>)}</ul>
        </details>
      ) : null}

      <article className="forecast-card">
        <div className="forecast-heading">
          <h3>本港地區預報</h3>
          <span>{forecast.description.publishedAt ? `更新 ${formatHktDateTime(forecast.description.publishedAt)}` : "暫無更新時間"}</span>
        </div>
        {forecast.description.value !== null ? (
          <>
            <p className="forecast-preview">{forecast.description.value}</p>
            {forecast.description.value.length > 68 ? (
              <details className="forecast-details">
                <summary>查看完整預報<AppIcon name="chevron" /></summary>
                <p>{forecast.description.value}</p>
              </details>
            ) : null}
            {forecast.description.status !== "fresh" ? <span className="metric-status" data-status={forecast.description.status}>{METRIC_STATUS_LABELS[forecast.description.status]}</span> : null}
          </>
        ) : (
          <p className="muted-copy">{forecast.description.message}</p>
        )}
      </article>
    </section>
  );
}
