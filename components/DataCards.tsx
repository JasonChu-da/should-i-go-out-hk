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
  return <span className="metric-status" data-status={metric.status}>{METRIC_STATUS_LABELS[metric.status]}</span>;
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
      <div className="section-heading">
        <div>
          <p className="eyebrow">已確認觀測</p>
          <h2 id="data-heading">現在的主要因素</h2>
        </div>
        <p>過時資料會標示，並自動排除於計分。</p>
      </div>

      <div className="data-grid">
        <article className="data-card">
          <div className="card-heading">
            <span className="card-icon" aria-hidden="true">℃</span>
            <div>
              <h3>天氣與體感</h3>
              <p>氣溫及空氣潮濕程度</p>
            </div>
          </div>
          {temperatureVisible ? (
            <div className="primary-metric">
              <span>{weather.temperatureC.value}</span><small>°C</small>
              <MetricState metric={weather.temperatureC} />
            </div>
          ) : (
            <MissingValue metric={weather.temperatureC} />
          )}
          <div className="secondary-metric">
            <span>相對濕度</span>
            {humidityVisible ? (
              <strong>{weather.humidityPercent.value}% <MetricState metric={weather.humidityPercent} /></strong>
            ) : (
              <strong>{METRIC_STATUS_LABELS[weather.humidityPercent.status]}</strong>
            )}
          </div>
          <p className="metric-meta">{weather.temperatureC.place ?? "香港天文台觀測"} · {metricTime(weather.temperatureC)}</p>
        </article>

        <article className="data-card">
          <div className="card-heading">
            <span className="card-icon" aria-hidden="true">☂</span>
            <div>
              <h3>降雨</h3>
              <p>過去一小時地區紀錄</p>
            </div>
          </div>
          {rainfallVisible ? (
            <div className="primary-metric">
              <span>{weather.rainfallMm.value}</span><small>毫米</small>
              <MetricState metric={weather.rainfallMm} />
            </div>
          ) : (
            <MissingValue metric={weather.rainfallMm} />
          )}
          <p className="plain-note">這是過去一小時錄得的雨量，不代表此刻一定正在下雨。</p>
          <p className="metric-meta">{weather.rainfallMm.place ?? "地區雨量"} · {metricTime(weather.rainfallMm)}</p>
        </article>

        <article className="data-card">
          <div className="card-heading">
            <span className="card-icon text-icon" aria-hidden="true">UV</span>
            <div>
              <h3>紫外線</h3>
              <p>陽光曝曬及曬傷風險</p>
            </div>
          </div>
          {uvVisible ? (
            <>
              <div className="primary-metric">
                <span>{weather.uvIndex.value}</span><small>{uvRisk(weather.uvIndex.value ?? 0)}</small>
                <MetricState metric={weather.uvIndex} />
              </div>
              <p className="plain-note">指數越高，皮膚及眼睛受紫外線傷害的風險越高。</p>
            </>
          ) : (
            <MissingValue metric={weather.uvIndex} />
          )}
          <p className="metric-meta">{weather.uvIndex.place ?? "香港天文台資料"} · {metricTime(weather.uvIndex)}</p>
        </article>

        <article className="data-card">
          <div className="card-heading">
            <span className="card-icon text-icon" aria-hidden="true">AQ</span>
            <div>
              <h3>空氣質素（AQHI）</h3>
              <p>數字越高，健康風險越高</p>
            </div>
          </div>
          {aqhiVisible ? (
            <div className="primary-metric">
              <span>{aqhi.aqhi.value?.display}</span><small>風險：{translateAqhiRisk(aqhi.healthRisk)}</small>
              <MetricState metric={aqhi.aqhi} />
            </div>
          ) : (
            <MissingValue metric={aqhi.aqhi} />
          )}
          <p className="plain-note">AQHI 是空氣污染健康風險指標；容易受影響人士應格外留意。</p>
          <p className="metric-meta">{aqhi.aqhi.place ?? "一般監測站"} · {metricTime(aqhi.aqhi)}</p>
        </article>
      </div>
    </section>
  );
}

