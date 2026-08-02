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
    const html = renderToStaticMarkup(<OutlookApp />);

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

  it("only renders warning tiles from a confirmed current snapshot", () => {
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

    expect(renderToStaticMarkup(<ActiveWarnings warnings={clear.warnings} />)).toBe("");
    expect(
      renderToStaticMarkup(<ActiveWarnings warnings={active.warnings} />),
    ).toContain("雷暴警告");
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

    for (const sceneId of [
      "clear-day",
      "clear-night",
      "cloudy-day",
      "cloudy-night",
      "overcast",
      "rain-light",
      "rain-heavy",
      "storm",
      "neutral",
      "reduced-motion",
    ]) {
      expect(html).toContain(sceneId);
    }
  });
});
