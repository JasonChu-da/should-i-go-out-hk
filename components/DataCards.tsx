import { AppIcon } from "@/components/AppIcon";
import type {
  NormalizedAqhi,
  NormalizedMetric,
  NormalizedRainfallNowcast,
  NormalizedWeather,
  OutlookLocation,
  RainfallNowcastValue,
} from "@/lib/domain/outlook";
import {
  formatHktTime,
  METRIC_STATUS_LABELS,
  metricTime,
  translateAqhiRisk,
  uvRisk,
} from "@/lib/presentation/format";

function MetricState({ metric }: { metric: NormalizedMetric<unknown> }) {
  if (metric.status === "fresh") return null;
  return (
    <span className="metric-status" data-status={metric.status}>
      {METRIC_STATUS_LABELS[metric.status]}
    </span>
  );
}

function MissingValue({
  metric,
  compact = false,
}: {
  metric: NormalizedMetric<unknown>;
  compact?: boolean;
}) {
  return (
    <div className="metric-unavailable">
      <strong>{METRIC_STATUS_LABELS[metric.status]}</strong>
      {compact ? null : <span>{metric.message}</span>}
    </div>
  );
}

interface DataCardsProps {
  weather: NormalizedWeather;
  aqhi: NormalizedAqhi;
  rainfallNowcast: NormalizedRainfallNowcast;
  location: OutlookLocation;
  generatedAt: string;
}

function formatRainfall(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function relativeQuarterHour(timestamp: string, generatedAt: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(timestamp) - Date.parse(generatedAt)) / (15 * 60_000),
    ) * 15,
  );
}

function futurePeriodLabel(
  startAt: string,
  endAt: string,
  generatedAt: string,
): string {
  const now = Date.parse(generatedAt);
  if (Date.parse(startAt) < now && now < Date.parse(endAt)) {
    return "目前這個半小時預報時段";
  }
  const start = relativeQuarterHour(startAt, generatedAt);
  const end = relativeQuarterHour(endAt, generatedAt);
  return start === 0
    ? `未來約 ${end} 分鐘內`
    : `約 ${start}–${end} 分鐘內`;
}

function coverageLabel(minutes: number): string {
  const rounded = Math.max(0, Math.min(120, Math.round(minutes / 5) * 5));
  if (minutes === 120) return "未來兩小時";
  if (rounded === 120) return "未來約 2 小時";
  if (rounded >= 60) {
    const remainder = rounded % 60;
    return remainder === 0
      ? `未來約 ${rounded / 60} 小時`
      : `未來約 ${Math.floor(rounded / 60)} 小時 ${remainder} 分鐘`;
  }
  return `未來約 ${rounded} 分鐘`;
}

function nowcastCopy(
  value: RainfallNowcastValue,
  location: OutlookLocation,
  generatedAt: string,
): { headline: string; detail: string } {
  if (!value.firstRainWindow) {
    return {
      headline:
        location.id === "hong-kong"
          ? `${coverageLabel(value.remainingCoverageMinutes)}，十八區代表格點暫未見明顯降雨訊號`
          : `${coverageLabel(value.remainingCoverageMinutes)}未見明顯降雨訊號`,
      detail: `資料實際覆蓋至 ${formatHktTime(value.coverageEndAt)}`,
    };
  }

  const first = value.periods[value.firstRainWindow.firstPeriodIndex];
  const last = value.periods[value.firstRainWindow.lastPeriodIndex];
  const place = location.id === "hong-kong" ? "香港部分地區" : location.label;
  const headline = first.isPartiallyElapsed
    ? `${place}目前這個半小時預報時段有降雨訊號`
    : `${place}${futurePeriodLabel(
        first.periodStartAt,
        last.periodEndAt,
        generatedAt,
      )}可能有雨`;
  const peak =
    value.peakRainPeriodIndex === null
      ? null
      : value.periods[value.peakRainPeriodIndex];

  return {
    headline,
    detail: peak
      ? `${futurePeriodLabel(
          peak.periodStartAt,
          peak.periodEndAt,
          generatedAt,
        )}${peak.isPartiallyElapsed ? "的完整" : "最高"}半小時預測雨量約 ${formatRainfall(peak.rainfallMm)} 毫米${peak.isPartiallyElapsed ? "（部分時段已經過去）" : ""}`
      : `資料實際覆蓋至 ${formatHktTime(value.coverageEndAt)}`,
  };
}

function RainfallBars({ value }: { value: RainfallNowcastValue }) {
  const peak = Math.max(...value.periods.map((period) => period.rainfallMm));

  return (
    <ol className="rainfall-bars" aria-label="未來四段半小時預測雨量">
      {value.periods.map((period) => {
        const height = peak === 0 ? 0 : (period.rainfallMm / peak) * 100;
        return (
          <li
            key={period.periodEndAt}
            data-partial={period.isPartiallyElapsed}
          >
            <span className="rain-bar-track" aria-hidden="true">
              <span
                data-empty={period.rainfallMm === 0}
                style={{ height: `${height}%` }}
              />
            </span>
            <strong>{formatRainfall(period.rainfallMm)}</strong>
            <small>毫米</small>
            <time dateTime={period.periodEndAt}>
              至 {formatHktTime(period.periodEndAt)}
            </time>
            {period.isPartiallyElapsed ? <em>進行中</em> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DataCards({
  weather,
  aqhi,
  rainfallNowcast,
  location,
  generatedAt,
}: DataCardsProps) {
  const temperatureVisible = weather.temperatureC.value !== null;
  const humidityVisible = weather.humidityPercent.value !== null;
  const rainfallVisible = weather.rainfallMm.value !== null;
  const uvVisible = weather.uvIndex.value !== null;
  const aqhiVisible = aqhi.aqhi.value !== null;
  const nowcastVisible =
    rainfallNowcast.forecast.status === "fresh" &&
    rainfallNowcast.forecast.value !== null;
  const nowcastValue = nowcastVisible
    ? (rainfallNowcast.forecast.value as RainfallNowcastValue)
    : null;
  const futureRain = nowcastValue
    ? nowcastCopy(nowcastValue, location, generatedAt)
    : null;

  return (
    <section className="data-section" aria-labelledby="data-heading">
      <div className="section-heading factor-heading">
        <div>
          <p className="eyebrow">即時觀測</p>
          <h2 id="data-heading">現在的狀況</h2>
        </div>
        <p>過時資料不計分</p>
      </div>

      <article className="rainfall-feature">
        <div className="rainfall-heading">
          <span className="card-icon" aria-hidden="true"><AppIcon name="rain" /></span>
          <div>
            <p>降雨</p>
            <h3>未來兩小時降雨</h3>
          </div>
        </div>

        <div className="rainfall-observation">
          <span>現在／過去一小時</span>
          {rainfallVisible ? (
            <strong>
              {formatRainfall(weather.rainfallMm.value ?? 0)}
              <small> 毫米</small>
              <MetricState metric={weather.rainfallMm} />
            </strong>
          ) : (
            <MissingValue metric={weather.rainfallMm} />
          )}
        </div>

        {nowcastValue && futureRain ? (
          <>
            <RainfallBars value={nowcastValue} />
            <p className="rainfall-window">{futureRain.headline}</p>
            <p className="rainfall-detail">{futureRain.detail}</p>
          </>
        ) : (
          <MissingValue metric={rainfallNowcast.forecast} />
        )}

        <p className="metric-meta rainfall-source">
          香港天文台兩小時降雨臨近預報 · {metricTime(rainfallNowcast.forecast)}
        </p>
      </article>

      <div className="metric-summary-grid">
        <article className="metric-summary-card" data-accent="temperature">
          <span className="card-icon" aria-hidden="true"><AppIcon name="thermometer" /></span>
          <h3>體感</h3>
          {temperatureVisible ? (
            <>
              <strong className="summary-value">{weather.temperatureC.value}°</strong>
              <span className="summary-status">
                {humidityVisible
                  ? `濕度 ${weather.humidityPercent.value}%`
                  : METRIC_STATUS_LABELS[weather.humidityPercent.status]}
              </span>
              <MetricState metric={weather.temperatureC} />
            </>
          ) : (
            <MissingValue metric={weather.temperatureC} compact />
          )}
        </article>

        <article className="metric-summary-card" data-accent="uv">
          <span className="card-icon" aria-hidden="true"><AppIcon name="sun" /></span>
          <h3>紫外線</h3>
          {uvVisible ? (
            <>
              <strong className="summary-value">{weather.uvIndex.value}</strong>
              <span className="summary-status">{uvRisk(weather.uvIndex.value ?? 0)}</span>
              <MetricState metric={weather.uvIndex} />
            </>
          ) : (
            <MissingValue metric={weather.uvIndex} compact />
          )}
        </article>

        <article className="metric-summary-card" data-accent="aqhi">
          <span className="card-icon" aria-hidden="true"><AppIcon name="air" /></span>
          <h3>AQHI</h3>
          {aqhiVisible ? (
            <>
              <strong className="summary-value">{aqhi.aqhi.value?.display}</strong>
              <span className="summary-status">風險 {translateAqhiRisk(aqhi.healthRisk)}</span>
              <MetricState metric={aqhi.aqhi} />
            </>
          ) : (
            <MissingValue metric={aqhi.aqhi} compact />
          )}
        </article>
      </div>

      <p className="observation-source-line">
        即時天氣 {metricTime(weather.temperatureC)} · AQHI {metricTime(aqhi.aqhi)}
      </p>
    </section>
  );
}
