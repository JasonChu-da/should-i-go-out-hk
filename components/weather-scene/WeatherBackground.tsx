"use client";

import { useEffect, useReducer, useRef } from "react";
import { weatherBackgroundAsset } from "@/lib/weather-scene/background-assets";
import type { WeatherSceneResult } from "@/lib/weather-scene/types";

interface WeatherBackgroundProps {
  scene: WeatherSceneResult;
  transitionEnabled: boolean;
}

type BackgroundVisual = Pick<
  WeatherSceneResult,
  "scene" | "period" | "severity"
>;

interface BackgroundState {
  current: BackgroundVisual;
  entering: boolean;
  previous: BackgroundVisual | null;
}

type BackgroundAction =
  | { type: "transition"; scene: BackgroundVisual }
  | { type: "reveal"; transition: boolean }
  | { type: "fail" }
  | { type: "finish" };

function backgroundReducer(
  state: BackgroundState,
  action: BackgroundAction,
): BackgroundState {
  switch (action.type) {
    case "transition":
      return { current: action.scene, previous: state.current, entering: true };
    case "reveal":
      return {
        ...state,
        entering: false,
        previous: action.transition ? state.previous : null,
      };
    case "fail":
      return state.previous
        ? { current: state.previous, previous: null, entering: false }
        : state;
    case "finish":
      return { ...state, previous: null };
  }
}

function BackgroundLayer({
  scene,
  className,
  onError,
  onLoad,
}: {
  scene: BackgroundVisual;
  className: string;
  onError?: () => void;
  onLoad?: () => void;
}) {
  const mobile = weatherBackgroundAsset(scene.period, scene.scene, "mobile");
  const desktop = weatherBackgroundAsset(scene.period, scene.scene, "desktop");

  return (
    <span
      className={`weather-background-layer ${className}`}
      data-scene={scene.scene}
      data-period={scene.period}
      data-severity={scene.severity}
    >
      <picture className="weather-background-picture">
        <source media="(min-width: 64rem)" srcSet={desktop} />
        <img
          className="weather-background-image"
          src={mobile}
          alt=""
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
            onError?.();
          }}
          onLoad={(event) => {
            event.currentTarget.style.visibility = "";
            onLoad?.();
          }}
        />
      </picture>
    </span>
  );
}

export function WeatherBackground({
  scene,
  transitionEnabled,
}: WeatherBackgroundProps) {
  const [state, dispatch] = useReducer(backgroundReducer, {
    current: {
      scene: scene.scene,
      period: scene.period,
      severity: scene.severity,
    },
    previous: null,
    entering: false,
  });
  const sceneName = scene.scene;
  const scenePeriod = scene.period;
  const sceneSeverity = scene.severity;
  const incomingKey = `${sceneName}:${scenePeriod}:${sceneSeverity}`;
  const displayedKey = useRef(incomingKey);

  useEffect(() => {
    const nextScene: BackgroundVisual = {
      scene: sceneName,
      period: scenePeriod,
      severity: sceneSeverity,
    };
    if (displayedKey.current === incomingKey) return;
    displayedKey.current = incomingKey;

    dispatch({ type: "transition", scene: nextScene });
  }, [
    incomingKey,
    sceneName,
    scenePeriod,
    sceneSeverity,
  ]);

  useEffect(() => {
    if (state.entering || !state.previous) return;
    const finishTimer = window.setTimeout(
      () => dispatch({ type: "finish" }),
      650,
    );
    return () => window.clearTimeout(finishTimer);
  }, [state.entering, state.previous]);

  return (
    <div
      className="weather-background"
      aria-hidden="true"
    >
      {state.previous ? (
        <BackgroundLayer scene={state.previous} className="is-previous" />
      ) : null}
      <BackgroundLayer
        scene={state.current}
        className={state.entering ? "is-current is-entering" : "is-current"}
        onError={() => dispatch({ type: "fail" })}
        onLoad={() =>
          dispatch({ type: "reveal", transition: transitionEnabled })
        }
      />
    </div>
  );
}
