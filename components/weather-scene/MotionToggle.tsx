"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AppIcon } from "@/components/AppIcon";

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
  const accessibleLabel = `動態背景：${stateLabel}`;

  return (
    <button
      className="motion-toggle"
      type="button"
      aria-pressed={enabled}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-reduced={reducedMotion}
      onClick={() => onChange(!enabled)}
    >
      <AppIcon name="air" />
      <span className="motion-toggle-dot" aria-hidden="true" />
    </button>
  );
}
