"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
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
  | { type: "fail"; keepCurrent: boolean }
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
      if (action.keepCurrent) {
        return { ...state, previous: null, entering: false };
      }
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
  const assetScene = scene.scene === "neutral" ? "clear" : scene.scene;
  const mobile = weatherBackgroundAsset(scene.period, assetScene, "mobile");
  const desktop = weatherBackgroundAsset(scene.period, assetScene, "desktop");
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) {
      image.style.visibility = "hidden";
      onError?.();
    }
  }, [desktop, mobile, onError]);

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
          ref={imageRef}
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
  const showingNeutral = sceneName === "neutral";
  const currentScene: BackgroundVisual = showingNeutral
    ? { scene: sceneName, period: scenePeriod, severity: sceneSeverity }
    : state.current;
  const handleImageError = useCallback(() => {
    dispatch({ type: "fail", keepCurrent: scene.scene === "neutral" });
  }, [scene.scene]);
  const handleImageLoad = useCallback(() => {
    dispatch({ type: "reveal", transition: transitionEnabled });
  }, [transitionEnabled]);

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
      {state.previous && !showingNeutral ? (
        <BackgroundLayer
          scene={state.previous}
          className="is-previous"
        />
      ) : null}
      <BackgroundLayer
        scene={currentScene}
        className={
          state.entering && !showingNeutral
            ? "is-current is-entering"
            : "is-current"
        }
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    </div>
  );
}
