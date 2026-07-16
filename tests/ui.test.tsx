import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OutlookApp from "@/components/OutlookApp";
import {
  DistrictPicker,
  LocationControls,
} from "@/components/LocationControls";
import { ModeTabs } from "@/components/ModeTabs";
import { ResultHero } from "@/components/ResultHero";
import { CompleteFailure, LoadingState } from "@/components/States";
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

describe("mobile UI semantics", () => {
  it("server-renders the initial loading experience without text input", () => {
    const html = renderToStaticMarkup(<OutlookApp />);

    expect(html).toContain("香港現在適合出門嗎？");
    expect(html).toContain("正在整理最新官方資料");
    expect(html).toContain("精確位置不會儲存或傳送");
    expect(html).toContain("一般外出");
    expect(html).toContain("跑步／踩單車");
    expect(html).toContain("晾衫");
    expect(html).not.toContain("<input");
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
  });

  it("announces a mode result and exposes a focusable verdict heading", () => {
    const html = renderToStaticMarkup(
      <ResultHero result={result} mode="general" dataLimited />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="result-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("外出分數 7 分，滿分 10 分");
    expect(html).toContain("資料有限");
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
});
