"use client";

import { useEffect, useReducer, useRef } from "react";
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
  | { type: "replace"; scene: BackgroundVisual }
  | { type: "settle" }
  | { type: "finish" };

function backgroundReducer(
  state: BackgroundState,
  action: BackgroundAction,
): BackgroundState {
  switch (action.type) {
    case "transition":
      return { current: action.scene, previous: state.current, entering: true };
    case "replace":
      return { current: action.scene, previous: null, entering: false };
    case "settle":
      return { ...state, entering: false };
    case "finish":
      return { ...state, previous: null };
  }
}

function BackgroundLayer({
  scene,
  className,
}: {
  scene: BackgroundVisual;
  className: string;
}) {
  return (
    <span
      className={`weather-background-layer ${className}`}
      data-scene={scene.scene}
      data-period={scene.period}
      data-severity={scene.severity}
    />
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
    if (displayedKey.current === incomingKey) {
      if (!transitionEnabled) {
        dispatch({ type: "replace", scene: nextScene });
      }
      return;
    }
    displayedKey.current = incomingKey;

    if (!transitionEnabled) {
      dispatch({ type: "replace", scene: nextScene });
      return;
    }

    dispatch({ type: "transition", scene: nextScene });
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => dispatch({ type: "settle" }));
    });
    const finishTimer = window.setTimeout(
      () => dispatch({ type: "finish" }),
      650,
    );

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(finishTimer);
    };
  }, [
    incomingKey,
    sceneName,
    scenePeriod,
    sceneSeverity,
    transitionEnabled,
  ]);

  return (
    <div className="weather-background" aria-hidden="true">
      {state.previous ? (
        <BackgroundLayer scene={state.previous} className="is-previous" />
      ) : null}
      <BackgroundLayer
        scene={state.current}
        className={state.entering ? "is-current is-entering" : "is-current"}
      />
    </div>
  );
}
