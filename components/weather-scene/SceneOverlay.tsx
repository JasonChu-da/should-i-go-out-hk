interface SceneOverlayProps {
  mist: boolean;
  motionEnabled: boolean;
  skyPulse: boolean;
}

export function SceneOverlay({
  mist,
  motionEnabled,
  skyPulse,
}: SceneOverlayProps) {
  return (
    <div className="scene-overlay" aria-hidden="true">
      <span
        className="scene-mist"
        data-visible={mist ? "true" : "false"}
        data-motion={motionEnabled ? "on" : "off"}
      />
      <span
        className="scene-sky-pulse"
        data-visible={skyPulse ? "true" : "false"}
        data-motion={motionEnabled ? "on" : "off"}
      />
      <span className="scene-readability" />
    </div>
  );
}
