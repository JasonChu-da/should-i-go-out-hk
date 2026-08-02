"use client";

import { useState } from "react";
import {
  MotionToggle,
  useMotionPreference,
  usePrefersReducedMotion,
} from "@/components/weather-scene/MotionToggle";
import { WeatherScene } from "@/components/weather-scene/WeatherScene";
import {
  WEATHER_PERIODS,
  WEATHER_SCENES,
} from "@/lib/weather-scene/background-assets";
import type {
  WeatherPeriod,
  WeatherSceneName,
  WeatherSceneResult,
} from "@/lib/weather-scene/types";

interface PreviewScene {
  id: string;
  label: string;
  period: WeatherPeriod;
  precipitation: WeatherSceneResult["precipitation"];
  scene: WeatherSceneName;
  severity: WeatherSceneResult["severity"];
  forceReducedMotion?: boolean;
}

const SCENE_LABELS: Record<WeatherSceneName, string> = {
  clear: "晴朗",
  cloudy: "多雲",
  overcast: "陰天",
  rain: "下雨",
  storm: "暴風",
  hot: "炎熱",
  neutral: "中性資料狀態",
};
const PERIOD_LABELS: Record<WeatherPeriod, string> = {
  day: "白天",
  dusk: "黃昏",
  night: "黑夜",
};

function previewValues(scene: WeatherSceneName): Pick<
  PreviewScene,
  "precipitation" | "severity"
> {
  if (scene === "storm") return { precipitation: "heavy", severity: "danger" };
  if (scene === "rain") return { precipitation: "medium", severity: "caution" };
  if (scene === "hot" || scene === "neutral") {
    return { precipitation: "none", severity: "caution" };
  }
  return { precipitation: "none", severity: "normal" };
}

const MATRIX_SCENES: PreviewScene[] = WEATHER_PERIODS.flatMap((period) =>
  WEATHER_SCENES.map((scene) => ({
    id: `${scene}-${period}`,
    label: `${SCENE_LABELS[scene]}・${PERIOD_LABELS[period]}`,
    period,
    scene,
    ...previewValues(scene),
  })),
);
const PREVIEW_SCENES: readonly PreviewScene[] = [
  ...MATRIX_SCENES,
  {
    id: "reduced-motion",
    scene: "clear",
    period: "night",
    label: "減少動態",
    precipitation: "none",
    severity: "normal",
    forceReducedMotion: true,
  },
];

export function WeatherScenePreview() {
  const [sceneName, setSceneName] = useState("clear-day");
  const [motionEnabled, setMotionEnabled] = useMotionPreference();
  const systemReducedMotion = usePrefersReducedMotion();
  const preview =
    PREVIEW_SCENES.find((item) => item.id === sceneName) ?? PREVIEW_SCENES[0];
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
