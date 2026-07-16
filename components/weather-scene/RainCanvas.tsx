"use client";

import { useEffect, useRef } from "react";
import type { WeatherPrecipitation } from "@/lib/weather-scene/types";

interface RainCanvasProps {
  enabled: boolean;
  intensity: WeatherPrecipitation;
}

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  wind: number;
}

const MOBILE_COUNTS: Readonly<Record<WeatherPrecipitation, number>> = {
  none: 0,
  light: 28,
  medium: 52,
  heavy: 82,
};

const DESKTOP_COUNTS: Readonly<Record<WeatherPrecipitation, number>> = {
  none: 0,
  light: 48,
  medium: 92,
  heavy: 148,
};

function createRainDrop(width: number, height: number, startAbove = false): RainDrop {
  return {
    x: Math.random() * width,
    y: startAbove ? -Math.random() * height * 0.35 : Math.random() * height,
    length: 10 + Math.random() * 18,
    speed: 7 + Math.random() * 9,
    opacity: 0.24 + Math.random() * 0.34,
    wind: 1.2 + Math.random() * 1.8,
  };
}

function hasLowAnimationBudget(): boolean {
  const saveData = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData,
  );
  return saveData || (navigator.hardwareConcurrency ?? 8) <= 4;
}

export function RainCanvas({ enabled, intensity }: RainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || intensity === "none") return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let width = 0;
    let height = 0;
    let drops: RainDrop[] = [];
    let animationFrame = 0;
    let resizeFrame = 0;
    let running = false;
    let previousTime = performance.now();

    const resize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const baseCount =
        width < 640 ? MOBILE_COUNTS[intensity] : DESKTOP_COUNTS[intensity];
      const targetCount = Math.max(
        18,
        Math.round(baseCount * (hasLowAnimationBudget() ? 0.58 : 1)),
      );
      drops = Array.from({ length: targetCount }, () =>
        createRainDrop(width, height),
      );
    };

    const draw = (time: number) => {
      if (!running) return;
      const delta = Math.min(2, Math.max(0.35, (time - previousTime) / 16.67));
      previousTime = time;
      context.clearRect(0, 0, width, height);
      context.lineWidth = intensity === "heavy" ? 1.25 : 1;
      context.lineCap = "round";
      context.strokeStyle = "rgb(211 232 244)";

      for (const drop of drops) {
        context.globalAlpha = drop.opacity;
        context.beginPath();
        context.moveTo(drop.x, drop.y);
        context.lineTo(drop.x + drop.wind, drop.y + drop.length);
        context.stroke();
        drop.y += drop.speed * delta;
        drop.x += drop.wind * 0.18 * delta;

        if (drop.y > height + drop.length || drop.x > width + 20) {
          Object.assign(drop, createRainDrop(width, height, true));
        }
      }

      context.globalAlpha = 1;
      animationFrame = window.requestAnimationFrame(draw);
    };

    const stop = () => {
      running = false;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      previousTime = performance.now();
      animationFrame = window.requestAnimationFrame(draw);
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    const handleResize = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resize);
    };

    resize();
    start();
    window.addEventListener("resize", handleResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      context.clearRect(0, 0, width, height);
    };
  }, [enabled, intensity]);

  return <canvas className="rain-canvas" ref={canvasRef} aria-hidden="true" />;
}
