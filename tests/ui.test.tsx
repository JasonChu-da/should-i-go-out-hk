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
    expect(html).toContain("跑步／踩單車");
    expect(html).toContain("晾衫");
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

  it("links the compact location control to the separate picker", () => {
    const html = renderToStaticMarkup(
      <LocationControls
        locationLabel="香港整體"
        locationNote="非地區化結果。"
        status="denied"
        pickerOpen
        onTogglePicker={vi.fn()}
      />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="district-picker"');
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
    expect(html).toContain('data-status="limited"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="7"');
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
    expect(html).toContain("查看詳情");
    expect((html.match(/<li/g) ?? [])).toHaveLength(5);
  });

  it("adds future rainfall inside the existing rain card with coverage and source time", () => {
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

    expect((html.match(/class="data-card/g) ?? [])).toHaveLength(4);
    expect(html).toContain("現在／過去一小時");
    expect(html).toContain("未來約 1 小時 55 分鐘未見明顯降雨訊號");
    expect(html).toContain("香港天文台兩小時降雨臨近預報");
    expect(html).toContain("資料時間");
    expect(html).toContain("13:55");
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
