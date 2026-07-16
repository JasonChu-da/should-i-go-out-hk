"use client";

import { useState } from "react";
import {
  MotionToggle,
  useMotionPreference,
  usePrefersReducedMotion,
} from "@/components/weather-scene/MotionToggle";
import { WeatherScene } from "@/components/weather-scene/WeatherScene";
import type {
  WeatherPeriod,
  WeatherSceneName,
  WeatherSceneResult,
} from "@/lib/weather-scene/types";

type PreviewSceneId =
  | "clear-day"
  | "clear-night"
  | "cloudy-day"
  | "cloudy-night"
  | "overcast"
  | "rain-light"
  | "rain-heavy"
  | "storm"
  | "hot-day"
  | "neutral"
  | "reduced-motion";

const PREVIEW_SCENES: ReadonlyArray<{
  id: PreviewSceneId;
  label: string;
  period: WeatherPeriod;
  precipitation: WeatherSceneResult["precipitation"];
  scene: WeatherSceneName;
  severity: WeatherSceneResult["severity"];
  forceReducedMotion?: boolean;
}> = [
  { id: "clear-day", scene: "clear", period: "day", label: "晴朗日間", precipitation: "none", severity: "normal" },
  { id: "clear-night", scene: "clear", period: "night", label: "晴朗夜間", precipitation: "none", severity: "normal" },
  { id: "cloudy-day", scene: "cloudy", period: "day", label: "多雲日間", precipitation: "none", severity: "normal" },
  { id: "cloudy-night", scene: "cloudy", period: "night", label: "多雲夜間", precipitation: "none", severity: "normal" },
  { id: "overcast", scene: "overcast", period: "day", label: "陰天", precipitation: "none", severity: "normal" },
  { id: "rain-light", scene: "rain", period: "day", label: "小雨", precipitation: "light", severity: "normal" },
  { id: "rain-heavy", scene: "rain", period: "night", label: "大雨", precipitation: "heavy", severity: "caution" },
  { id: "storm", scene: "storm", period: "night", label: "雷暴", precipitation: "heavy", severity: "danger" },
  { id: "hot-day", scene: "hot", period: "day", label: "炎熱日間", precipitation: "none", severity: "caution" },
  { id: "neutral", scene: "neutral", period: "night", label: "中性資料狀態", precipitation: "none", severity: "caution" },
  { id: "reduced-motion", scene: "clear", period: "night", label: "減少動態", precipitation: "none", severity: "normal", forceReducedMotion: true },
];

export function WeatherScenePreview() {
  const [sceneName, setSceneName] = useState<PreviewSceneId>("clear-day");
  const [motionEnabled, setMotionEnabled] = useMotionPreference();
  const systemReducedMotion = usePrefersReducedMotion();
  const preview = PREVIEW_SCENES.find((item) => item.id === sceneName) ?? PREVIEW_SCENES[0];
  const reducedMotion = systemReducedMotion || Boolean(preview.forceReducedMotion);
  const scene: WeatherSceneResult = {
    scene: preview.scene,
    period: preview.period,
    precipitation: preview.precipitation,
    severity: preview.severity,
    animationEnabled: preview.scene !== "neutral",
    reason: "只限 development 的視覺驗收場景。",
  };

  return (
    <>
      <WeatherScene
        scene={scene}
        motionEnabled={motionEnabled}
        reducedMotion={reducedMotion}
      />
      <main className="scene-preview-shell">
        <header className="scene-preview-header">
          <div>
            <p className="brand-kicker">僅限開發環境</p>
            <h1>WeatherScene 驗收台</h1>
          </div>
          <MotionToggle
            enabled={motionEnabled}
            reducedMotion={reducedMotion}
            onChange={setMotionEnabled}
          />
        </header>
        <section className="scene-preview-panel" aria-labelledby="preview-scene-heading">
          <div className="scene-preview-heading">
            <div>
              <p className="eyebrow">目前場景</p>
              <h2 id="preview-scene-heading">{preview.label}</h2>
            </div>
            <code>{preview.id}</code>
          </div>
          <div className="scene-preview-grid" role="group" aria-label="選擇預覽天氣場景">
            {PREVIEW_SCENES.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={sceneName === item.id}
                onClick={() => setSceneName(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.id}</small>
              </button>
            ))}
          </div>
          <dl className="scene-preview-data">
            <div><dt>scene</dt><dd>{scene.scene}</dd></div>
            <div><dt>precipitation</dt><dd>{scene.precipitation}</dd></div>
            <div><dt>severity</dt><dd>{scene.severity}</dd></div>
            <div><dt>period</dt><dd>{scene.period}</dd></div>
            <div><dt>motion</dt><dd>{motionEnabled && !reducedMotion ? "on" : "off"}</dd></div>
          </dl>
        </section>
      </main>
    </>
  );
}
