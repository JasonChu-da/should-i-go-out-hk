"use client";

import { useCallback, useSyncExternalStore } from "react";

const MOTION_STORAGE_KEY = "weather-scene-motion:v1";
const MOTION_CHANGE_EVENT = "weather-scene-motion-change";

function getMotionSnapshot(): boolean {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function getMotionServerSnapshot(): boolean {
  return true;
}

function subscribeToMotionPreference(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === MOTION_STORAGE_KEY) {
      document.documentElement.dataset.weatherMotion =
        event.newValue === "off" ? "off" : "on";
      onStoreChange();
    }
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(MOTION_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(MOTION_CHANGE_EVENT, onStoreChange);
  };
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function subscribeToReducedMotion(onStoreChange: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

export function useMotionPreference(): readonly [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(
    subscribeToMotionPreference,
    getMotionSnapshot,
    getMotionServerSnapshot,
  );
  const setEnabled = useCallback((next: boolean) => {
    document.documentElement.dataset.weatherMotion = next ? "on" : "off";
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // The control remains useful for this render even when storage is blocked.
    }
    window.dispatchEvent(new Event(MOTION_CHANGE_EVENT));
  }, []);
  return [enabled, setEnabled] as const;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

interface MotionToggleProps {
  enabled: boolean;
  reducedMotion: boolean;
  onChange: (enabled: boolean) => void;
}

export function MotionToggle({
  enabled,
  reducedMotion,
  onChange,
}: MotionToggleProps) {
  const stateLabel = !enabled ? "關" : reducedMotion ? "已減少" : "開";
  return (
    <button
      className="motion-toggle"
      type="button"
      aria-pressed={enabled}
      aria-label={`動態背景：${stateLabel}`}
      onClick={() => onChange(!enabled)}
    >
      <span className="motion-toggle-mark" aria-hidden="true"><span /></span>
      <span>動態背景</span>
      <strong className="motion-toggle-state" aria-hidden="true">
        <span className="motion-toggle-state-on">開</span>
        <span className="motion-toggle-state-off">關</span>
        <span className="motion-toggle-state-reduced">已減少</span>
      </strong>
    </button>
  );
}
