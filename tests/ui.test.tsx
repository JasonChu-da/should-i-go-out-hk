import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildOutlookFixture } from "@/e2e/fixtures/outlook";
import { DataCards } from "@/components/DataCards";
import OutlookApp from "@/components/OutlookApp";
import {
  DistrictPicker,
  LocationControls,
} from "@/components/LocationControls";
import { ModeTabs } from "@/components/ModeTabs";
import { ResultHero } from "@/components/ResultHero";
import { SourceDetails } from "@/components/SourceDetails";
import { CompleteFailure, LoadingState } from "@/components/States";
import { ActiveWarnings, ForecastDetails } from "@/components/WarningsPanel";
import { WeatherScene } from "@/components/weather-scene/WeatherScene";
import { WeatherScenePreview } from "@/components/weather-scene/WeatherScenePreview";
import type { SourceMeta } from "@/lib/domain/outlook";
import { DISTRICTS } from "@/lib/location/districts";
import type { ScoringResult } from "@/lib/scoring/types";

const result: ScoringResult = {
  score: 7,
  verdict: "prepare",
  verdictLabel: "可以出門，但需要準備",
  summary: "部分資料未能確認，分數最高為 7。",
  recommendations: ["出門前查看香港天文台。"],
  factors: [],
  ignoredFactors: [],
  isLimited: true,
};

const sources: SourceMeta[] = ([
  "weather",
  "warnings",
  "forecast",
  "aqhi",
  "rainfallNowcast",
] as const).map((id) => ({
  id,
  label: id,
  url: "https://example.com",
  status: "ok",
  retrievedAt: "2026-07-16T05:05:00.000Z",
  publishedAt: "2026-07-16T05:02:00.000Z",
  rawPublishedAt: "2026-07-16T13:02:00+08:00",
  issues: [],
}));

describe("mobile UI semantics", () => {
  it("server-renders the initial loading experience without text input", () => {
    const html = renderToStaticMarkup(<OutlookApp initialPeriod="day" />);

    expect(html).toContain("香港現在適合出門嗎？");
    expect(html).toContain("正在整理最新官方資料…");
    expect(html).toContain("精確位置不會儲存或傳送");
    expect(html).toContain("一般外出");
    expect(html).not.toContain("跑步／踩單車");
    expect(html).not.toContain("晾衫");
    expect(html).not.toContain("<input");
    expect(html).toContain("跳至主要內容");
  });

  it("renders all eighteen districts plus Hong Kong-wide fallback as buttons", () => {
    const html = renderToStaticMarkup(
      <DistrictPicker locationId="hong-kong" onSelect={vi.fn()} />,
    );

    expect((html.match(/<button/g) ?? [])).toHaveLength(19);
    expect(html).toContain("香港整體");
    for (const district of DISTRICTS) expect(html).toContain(district.nameTc);
    expect(html).not.toContain("<input");
  });

  it("links the compact location control to its expanded picker", () => {
    const html = renderToStaticMarkup(
      <LocationControls
        locationLabel="香港整體"
        modeLabel="一般外出"
        locationNote="非地區化結果。"
        status="denied"
        pickerPhase="open"
        onTogglePicker={vi.fn()}
      >
        <div id="quick-controls">選擇界面</div>
      </LocationControls>,
    );

    expect(html).toContain('data-open="true"');
    expect(html).toContain('data-phase="open"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="quick-controls"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="location-dialog-title"');
    expect(html).toContain("地區及活動選擇");
    expect(html).toContain('id="quick-controls"');
    expect(html).toContain("選擇界面");
    expect(html).toContain("香港整體");
    expect(html).toContain("一般外出");
    expect(html).toContain("位置權限已被拒絕");
  });

  it("exposes all modes as one-tap pressed-state buttons", () => {
    const html = renderToStaticMarkup(
      <ModeTabs mode="exercise" onChange={vi.fn()} />,
    );

    expect((html.match(/<button/g) ?? [])).toHaveLength(3);
    expect(html).toContain('aria-label="選擇外出模式"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-active-index="1"');
    expect(html).toContain('class="mode-tab-indicator"');
  });

  it("announces a mode result and exposes a focusable verdict heading", () => {
    const html = renderToStaticMarkup(
      <ResultHero result={result} mode="general" />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="result-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("外出分數 7 分，滿分 10 分");
    expect(html).toContain("資料有限");
    expect(html).not.toContain('class="status-chip"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="7"');
    expect(html).toContain("外出指數");
    expect(html.indexOf("可以出門，但需要準備")).toBeLessThan(
      html.indexOf("外出指數"),
    );
  });

  it("provides understandable loading and complete-failure actions", () => {
    const loading = renderToStaticMarkup(<LoadingState />);
    const failed = renderToStaticMarkup(<CompleteFailure onRetry={vi.fn()} />);

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("載入時間比預期長");
    expect(loading).toContain('href="/"');
    expect(failed).toContain("重新載入資料");
    expect(failed).toContain("前往香港天文台");
    expect(failed).toContain('role="alert"');
  });

  it("summarizes sources before exposing per-source timestamps", () => {
    const html = renderToStaticMarkup(<SourceDetails sources={sources} />);

    expect(html).toContain("5 個資料來源可用");
    expect(html).toContain("最新更新 13:02");
    expect(html).toContain("utility-summary-action\">查看");
    expect((html.match(/<li/g) ?? [])).toHaveLength(5);
  });

  it("renders one rainfall feature and three compact summaries from existing data", () => {
    const payload = buildOutlookFixture("wan-chai");
    const html = renderToStaticMarkup(
      <DataCards
        weather={payload.weather}
        aqhi={payload.aqhi}
        rainfallNowcast={payload.rainfallNowcast}
        location={payload.location}
        generatedAt={payload.generatedAt}
      />,
    );

    expect((html.match(/class="rainfall-feature/g) ?? [])).toHaveLength(1);
    expect((html.match(/class="metric-summary-card/g) ?? [])).toHaveLength(3);
    expect((html.match(/class="rain-bar-track/g) ?? [])).toHaveLength(4);
    expect((html.match(/data-empty="true"/g) ?? [])).toHaveLength(4);
    expect(html).toContain("現在／過去一小時");
    expect(html).toContain("未來約 1 小時 55 分鐘未見明顯降雨訊號");
    expect(html).toContain("香港天文台兩小時降雨臨近預報");
    expect(html).toContain("資料時間");
    expect(html).toContain("13:55");
  });

  it("explains an active nowcast period without scaling its full half-hour rainfall", () => {
    const payload = buildOutlookFixture("wan-chai");
    const value = payload.rainfallNowcast.forecast.value;
    if (!value) throw new Error("測試 fixture 缺少降雨臨近預報");
    value.periods[0].rainfallMm = 2.4;
    value.periods[0].isPartiallyElapsed = true;
    value.firstRainWindow = { firstPeriodIndex: 0, lastPeriodIndex: 0 };
    value.peakRainPeriodIndex = 0;

    const html = renderToStaticMarkup(
      <DataCards
        weather={payload.weather}
        aqhi={payload.aqhi}
        rainfallNowcast={payload.rainfallNowcast}
        location={payload.location}
        generatedAt={payload.generatedAt}
      />,
    );

    expect(html).toContain("灣仔目前這個半小時預報時段有降雨訊號");
    expect(html).toContain("完整半小時預測雨量約 2.4 毫米");
    expect(html).toContain("部分時段已經過去");
    expect(html).toContain("進行中");
  });

  it("shows explicit unavailable states instead of fallback metric values", () => {
    const payload = buildOutlookFixture();
    payload.weather.temperatureC.value = null;
    payload.weather.humidityPercent.value = null;
    payload.weather.rainfallMm.value = null;
    payload.weather.uvIndex.value = null;
    payload.aqhi.aqhi.value = null;
    payload.rainfallNowcast.forecast.status = "failed";
    payload.rainfallNowcast.forecast.value = null;

    const html = renderToStaticMarkup(
      <DataCards
        weather={payload.weather}
        aqhi={payload.aqhi}
        rainfallNowcast={payload.rainfallNowcast}
        location={payload.location}
        generatedAt={payload.generatedAt}
      />,
    );

    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
    expect(html).toContain(payload.weather.temperatureC.message);
    expect(html).toContain(payload.rainfallNowcast.forecast.message);
  });

  it("shows confirmed warning items even when another item is malformed", () => {
    const clear = buildOutlookFixture();
    const active = buildOutlookFixture();
    active.warnings.items = [
      {
        family: "WTS",
        code: "WTS",
        name: "雷暴警告",
        actionCode: "ISSUE",
        type: "雷暴警告",
        issueTime: "2026-07-27T05:30:00.000Z",
        updateTime: "2026-07-27T05:55:00.000Z",
        expireTime: null,
      },
    ];
    const unavailable = buildOutlookFixture();
    unavailable.warnings.source.status = "unavailable";
    unavailable.warnings.items = active.warnings.items;
    const incomplete = buildOutlookFixture();
    incomplete.warnings.isSnapshotComplete = false;
    incomplete.warnings.items = active.warnings.items;

    expect(renderToStaticMarkup(<ActiveWarnings warnings={clear.warnings} />)).toBe("");
    expect(
      renderToStaticMarkup(<ActiveWarnings warnings={active.warnings} />),
    ).toContain("雷暴警告");
    const incompleteHtml = renderToStaticMarkup(
      <ActiveWarnings warnings={incomplete.warnings} />,
    );
    expect(incompleteHtml).toContain("部分警告項目格式異常");
    expect(incompleteHtml).toContain("warning-tile");
    expect(incompleteHtml).toContain("雷暴警告");
    const unavailableHtml = renderToStaticMarkup(
      <ActiveWarnings warnings={unavailable.warnings} />,
    );
    expect(unavailableHtml).toContain("未能完整確認目前天氣警告");
    expect(unavailableHtml).not.toContain("warning-tile");
  });

  it("keeps forecast copy in a compact native disclosure", () => {
    const payload = buildOutlookFixture();
    const html = renderToStaticMarkup(
      <ForecastDetails forecast={payload.forecast} weather={payload.weather} />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("本港預報與提示");
    expect(html).toContain("大致天晴，部分時間有陽光。");
  });

  it("renders unavailable scoring, factors and ignored data without a score gauge", () => {
    const unavailable: ScoringResult = {
      score: null,
      verdict: "unavailable",
      verdictLabel: "暫時未能判斷",
      summary: "未能確認必要資料。",
      recommendations: ["稍後重試。", "查看天文台。", "留意警告。", "不應顯示。"],
      factors: [
        {
          id: "warning",
          label: "天氣警告",
          detail: "警告資料不可用。",
          penalty: 0,
          cap: null,
          priority: 1,
          recommendation: null,
        },
      ],
      ignoredFactors: [
        {
          id: "humidity",
          label: "濕度",
          status: "missing",
          message: "資料暫時不可用。",
        },
      ],
      isLimited: true,
    };
    const html = renderToStaticMarkup(
      <ResultHero result={unavailable} mode="laundry" />,
    );

    expect(html).toContain("晾衫評估");
    expect(html).toContain("暫未能評分");
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain("天氣警告");
    expect(html).toContain("未有計分的資料");
    expect(html).toContain("濕度：資料暫時不可用。");
    expect(html).not.toContain("不應顯示。");
  });

  it("labels stale and unavailable sources and reports recoverable issues", () => {
    const degraded = sources.map((source, index) => ({
      ...source,
      status: index === 0 ? ("stale" as const) : ("unavailable" as const),
      publishedAt: index === 1 ? null : source.publishedAt,
      issues: index === 2 ? ["測試欄位異常"] : [],
    }));
    const html = renderToStaticMarkup(<SourceDetails sources={degraded} />);

    expect(html).toContain("0 個資料來源可用");
    expect(html).toContain("可能已過時");
    expect(html).toContain("暫時不可用");
    expect(html).toContain("部分欄位未能讀取（1 項）");
  });

  it("explains stale warnings and degraded forecast content", () => {
    const payload = buildOutlookFixture();
    payload.warnings.source.status = "stale";
    payload.forecast.description.status = "stale";
    payload.forecast.description.publishedAt = null;
    payload.weather.specialWeatherTips = ["測試特別提示"];

    const warningsHtml = renderToStaticMarkup(
      <ActiveWarnings warnings={payload.warnings} />,
    );
    const forecastHtml = renderToStaticMarkup(
      <ForecastDetails forecast={payload.forecast} weather={payload.weather} />,
    );

    expect(warningsHtml).toContain("警告快照可能已過時");
    expect(forecastHtml).toContain("暫無更新時間");
    expect(forecastHtml).toContain("可能已過時");
    expect(forecastHtml).toContain("測試特別提示");
  });

  it("only exposes the star layer for a verified clear night", () => {
    const clearNight = renderToStaticMarkup(
      <WeatherScene
        scene={{
          scene: "clear",
          period: "night",
          precipitation: "none",
          severity: "normal",
          animationEnabled: true,
          reason: "測試晴朗夜空。",
        }}
        motionEnabled
        reducedMotion={false}
      />,
    );
    const cloudyNight = renderToStaticMarkup(
      <WeatherScene
        scene={{
          scene: "cloudy",
          period: "night",
          precipitation: "none",
          severity: "normal",
          animationEnabled: true,
          reason: "測試多雲夜空。",
        }}
        motionEnabled
        reducedMotion={false}
      />,
    );

    expect(clearNight).toContain('class="night-sky-layer" data-visible="true"');
    expect(clearNight).toContain("cloud-depth-far");
    expect(clearNight).toContain("cloud-depth-near");
    expect(cloudyNight).toContain('class="night-sky-layer" data-visible="false"');
  });

  it("disables scene motion for the manual toggle and reduced-motion preference", () => {
    const scene = {
      scene: "storm" as const,
      period: "night" as const,
      precipitation: "heavy" as const,
      severity: "danger" as const,
      animationEnabled: true,
      reason: "測試雷暴場景。",
    };
    const manuallyDisabled = renderToStaticMarkup(
      <WeatherScene
        scene={scene}
        motionEnabled={false}
        reducedMotion={false}
      />,
    );
    const systemReduced = renderToStaticMarkup(
      <WeatherScene scene={scene} motionEnabled reducedMotion />,
    );

    expect(manuallyDisabled).toContain('data-motion="off"');
    expect(systemReduced).toContain('data-motion="off"');
  });

  it("renders every required development scene preview", () => {
    const html = renderToStaticMarkup(<WeatherScenePreview />);

    for (const period of ["day", "dusk", "night"]) {
      for (const scene of [
        "clear",
        "cloudy",
        "overcast",
        "rain",
        "storm",
        "hot",
        "neutral",
      ]) {
        expect(html).toContain(`${scene}-${period}`);
      }
    }
    expect(html).toContain("reduced-motion");
    expect(html).toContain("<picture");
    expect(html).toContain('media="(min-width: 64rem)"');
    expect(html).toContain("/weather/scenes/day/clear-mobile.webp");
    expect(html).toContain("/weather/scenes/day/clear-desktop.webp");
  });
});
