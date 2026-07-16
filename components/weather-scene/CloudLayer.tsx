import type { CloudMode } from "@/lib/weather-scene/scene-themes";

interface CloudLayerProps {
  mode: CloudMode;
  motionEnabled: boolean;
}

function CloudShape() {
  return (
    <svg viewBox="0 0 360 130" focusable="false" aria-hidden="true">
      <path
        d="M34 104c-19 0-34-13-34-30 0-15 12-28 29-30C35 22 57 8 83 8c25 0 47 13 55 33 9-8 21-13 35-13 25 0 46 17 49 39 7-4 16-6 25-6 24 0 44 16 44 36 0 19-19 33-43 33H40c-22 0-40-11-40-26 0-1 0-1 .1-2C9 103 21 104 34 104Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CloudLayer({ mode, motionEnabled }: CloudLayerProps) {
  return (
    <div
      className="cloud-layer"
      data-density={mode}
      data-motion={motionEnabled ? "on" : "off"}
      aria-hidden="true"
    >
      <span className="cloud-depth cloud-depth-far">
        <span className="scene-cloud scene-cloud-far-a"><CloudShape /></span>
        <span className="scene-cloud scene-cloud-far-b"><CloudShape /></span>
        <span className="scene-cloud scene-cloud-far-c"><CloudShape /></span>
      </span>
      <span className="cloud-depth cloud-depth-near">
        <span className="scene-cloud scene-cloud-near-a"><CloudShape /></span>
        <span className="scene-cloud scene-cloud-near-b"><CloudShape /></span>
      </span>
    </div>
  );
}
