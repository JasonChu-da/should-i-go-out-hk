import { AppIcon } from "@/components/AppIcon";
import type {
  NormalizedAqhi,
  NormalizedMetric,
  NormalizedWeather,
} from "@/lib/domain/outlook";
import {
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

function MissingValue({ metric }: { metric: NormalizedMetric<unknown> }) {
  return (
    <div className="metric-unavailable">
      <strong>{METRIC_STATUS_LABELS[metric.status]}</strong>
      <span>{metric.message}</span>
    </div>
  );
}

interface DataCardsProps {
  weather: NormalizedWeather;
  aqhi: NormalizedAqhi;
}

export function DataCards({ weather, aqhi }: DataCardsProps) {
  const temperatureVisible = weather.temperatureC.value !== null;
  const humidityVisible = weather.humidityPercent.value !== null;
  const rainfallVisible = weather.rainfallMm.value !== null;
  const uvVisible = weather.uvIndex.value !== null;
  const aqhiVisible = aqhi.aqhi.value !== null;

  return (
    <section className="data-section" aria-labelledby="data-heading">
      <div className="section-heading factor-heading">
        <div>
          <p className="eyebrow">即時觀測</p>
          <h2 id="data-heading">現在的因素</h2>
        </div>
        <p>過時資料不計分</p>
      </div>

      <div className="data-grid">
        <article className="data-card" data-accent="temperature">
          <div className="card-heading">
            <span className="card-icon" aria-hidden="true"><AppIcon name="thermometer" /></span>
            <h3>體感</h3>
          </div>
          {temperatureVisible ? (
            <>
              <div className="primary-metric">
                <span>{weather.temperatureC.value}°</span>
                <MetricState metric={weather.temperatureC} />
              </div>
              <p className="factor-status">
                {humidityVisible ? `濕度 ${weather.humidityPercent.value}%` : METRIC_STATUS_LABELS[weather.humidityPercent.status]}
              </p>
            </>
          ) : (
            <MissingValue metric={weather.temperatureC} />
          )}
          <p className="metric-meta">{weather.temperatureC.place ?? "天文台觀測"} · {metricTime(weather.temperatureC)}</p>
        </article>

        <article className="data-card" data-accent="rainfall">
          <div className="card-heading">
            <span className="card-icon" aria-hidden="true"><AppIcon name="rain" /></span>
            <h3>降雨</h3>
          </div>
          {rainfallVisible ? (
            <>
              <div className="primary-metric">
                <span>{weather.rainfallMm.value}</span><small>毫米</small>
                <MetricState metric={weather.rainfallMm} />
              </div>
              <p className="factor-status">過去一小時</p>
            </>
          ) : (
            <MissingValue metric={weather.rainfallMm} />
          )}
          <p className="metric-meta">{weather.rainfallMm.place ?? "地區雨量"} · {metricTime(weather.rainfallMm)}</p>
        </article>

        <article className="data-card" data-accent="uv">
          <div className="card-heading">
            <span className="card-icon" aria-hidden="true"><AppIcon name="sun" /></span>
            <h3>紫外線</h3>
          </div>
          {uvVisible ? (
            <>
              <div className="primary-metric">
                <span>{weather.uvIndex.value}</span>
                <MetricState metric={weather.uvIndex} />
              </div>
              <p className="factor-status">{uvRisk(weather.uvIndex.value ?? 0)}</p>
            </>
          ) : (
            <MissingValue metric={weather.uvIndex} />
          )}
          <p className="metric-meta">{weather.uvIndex.place ?? "天文台資料"} · {metricTime(weather.uvIndex)}</p>
        </article>

        <article className="data-card" data-accent="aqhi">
          <div className="card-heading">
            <span className="card-icon" aria-hidden="true"><AppIcon name="air" /></span>
            <h3>AQHI</h3>
          </div>
          {aqhiVisible ? (
            <>
              <div className="primary-metric">
                <span>{aqhi.aqhi.value?.display}</span>
                <MetricState metric={aqhi.aqhi} />
              </div>
              <p className="factor-status">風險 {translateAqhiRisk(aqhi.healthRisk)}</p>
            </>
          ) : (
            <MissingValue metric={aqhi.aqhi} />
          )}
          <p className="metric-meta">{aqhi.aqhi.place ?? "監測站"} · {metricTime(aqhi.aqhi)}</p>
        </article>
      </div>
    </section>
  );
}
