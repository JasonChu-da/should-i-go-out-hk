"use client";

import { CloudLayer } from "@/components/weather-scene/CloudLayer";
import { NightSkyLayer } from "@/components/weather-scene/NightSkyLayer";
import { RainCanvas } from "@/components/weather-scene/RainCanvas";
import { SceneOverlay } from "@/components/weather-scene/SceneOverlay";
import { WeatherBackground } from "@/components/weather-scene/WeatherBackground";
import { WeatherGlow } from "@/components/weather-scene/WeatherGlow";
import { WEATHER_SCENE_THEMES } from "@/lib/weather-scene/scene-themes";
import type { WeatherSceneResult } from "@/lib/weather-scene/types";

interface WeatherSceneProps {
  motionEnabled: boolean;
  reducedMotion: boolean;
  scene: WeatherSceneResult;
}

export function WeatherScene({
  motionEnabled,
  reducedMotion,
  scene,
}: WeatherSceneProps) {
  const theme = WEATHER_SCENE_THEMES[scene.scene];
  const effectiveMotion =
    scene.animationEnabled && motionEnabled && !reducedMotion;
  const rainEnabled =
    effectiveMotion &&
    (scene.scene === "rain" || scene.scene === "storm") &&
    scene.precipitation !== "none";

  return (
    <div
      className="weather-scene"
      data-scene={scene.scene}
      data-period={scene.period}
      data-severity={scene.severity}
      data-motion={effectiveMotion ? "on" : "off"}
      aria-hidden="true"
    >
      <WeatherBackground
        scene={scene}
        transitionEnabled={
          scene.animationEnabled && motionEnabled && !reducedMotion
        }
      />
      <WeatherGlow motionEnabled={effectiveMotion} />
      <NightSkyLayer
        visible={scene.scene === "clear" && scene.period === "night"}
        motionEnabled={effectiveMotion}
      />
      <CloudLayer mode={theme.cloudMode} motionEnabled={effectiveMotion} />
      <RainCanvas enabled={rainEnabled} intensity={scene.precipitation} />
      <SceneOverlay
        mist={theme.mist}
        motionEnabled={effectiveMotion}
        skyPulse={theme.skyPulse}
      />
    </div>
  );
}
