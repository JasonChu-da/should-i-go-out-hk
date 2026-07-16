import type { CSSProperties } from "react";

interface NightSkyLayerProps {
  visible: boolean;
  motionEnabled: boolean;
}

interface StarDefinition {
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
}

const STARS: readonly StarDefinition[] = Object.freeze([
  { x: 7, y: 12, size: 1, opacity: 0.34, delay: -3, duration: 8 },
  { x: 14, y: 28, size: 1, opacity: 0.28, delay: -7, duration: 10 },
  { x: 22, y: 8, size: 2, opacity: 0.36, delay: -2, duration: 12 },
  { x: 31, y: 19, size: 1, opacity: 0.3, delay: -9, duration: 11 },
  { x: 38, y: 5, size: 1, opacity: 0.24, delay: -4, duration: 9 },
  { x: 46, y: 31, size: 2, opacity: 0.32, delay: -6, duration: 13 },
  { x: 52, y: 13, size: 1, opacity: 0.26, delay: -1, duration: 10 },
  { x: 61, y: 24, size: 1, opacity: 0.34, delay: -8, duration: 12 },
  { x: 68, y: 7, size: 1, opacity: 0.25, delay: -5, duration: 9 },
  { x: 74, y: 35, size: 2, opacity: 0.3, delay: -10, duration: 14 },
  { x: 82, y: 19, size: 1, opacity: 0.28, delay: -3, duration: 11 },
  { x: 91, y: 9, size: 1, opacity: 0.34, delay: -7, duration: 13 },
  { x: 10, y: 46, size: 1, opacity: 0.2, delay: -5, duration: 12 },
  { x: 27, y: 41, size: 1, opacity: 0.22, delay: -2, duration: 10 },
  { x: 57, y: 44, size: 1, opacity: 0.2, delay: -9, duration: 13 },
  { x: 87, y: 48, size: 1, opacity: 0.18, delay: -4, duration: 11 },
]);

function starStyle(star: StarDefinition): CSSProperties {
  return {
    "--star-x": `${star.x}%`,
    "--star-y": `${star.y}%`,
    "--star-size": `${star.size}px`,
    "--star-opacity": star.opacity,
    "--star-delay": `${star.delay}s`,
    "--star-duration": `${star.duration}s`,
  } as CSSProperties;
}

export function NightSkyLayer({
  visible,
  motionEnabled,
}: NightSkyLayerProps) {
  return (
    <div
      className="night-sky-layer"
      data-visible={visible ? "true" : "false"}
      data-motion={motionEnabled ? "on" : "off"}
      aria-hidden="true"
    >
      <span className="night-city-glow" />
      <span className="night-moon-glow" />
      <span className="night-star-field">
        {STARS.map((star, index) => (
          <span className="night-star" style={starStyle(star)} key={index} />
        ))}
      </span>
    </div>
  );
}
