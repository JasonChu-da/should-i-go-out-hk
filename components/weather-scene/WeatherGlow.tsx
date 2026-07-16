interface WeatherGlowProps {
  motionEnabled: boolean;
}

export function WeatherGlow({ motionEnabled }: WeatherGlowProps) {
  return (
    <div
      className="weather-glow"
      data-motion={motionEnabled ? "on" : "off"}
      aria-hidden="true"
    >
      <span className="weather-glow-orb weather-glow-sky" />
      <span className="weather-glow-orb weather-glow-indigo" />
      <span className="weather-glow-orb weather-glow-cyan" />
    </div>
  );
}
