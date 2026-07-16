export type WeatherSceneName =
  | "clear"
  | "cloudy"
  | "overcast"
  | "rain"
  | "storm"
  | "hot"
  | "neutral";

export type WeatherPeriod = "day" | "night";
export type WeatherPrecipitation = "none" | "light" | "medium" | "heavy";
export type WeatherSceneSeverity = "normal" | "caution" | "danger";

export interface WeatherSceneResult {
  scene: WeatherSceneName;
  period: WeatherPeriod;
  precipitation: WeatherPrecipitation;
  severity: WeatherSceneSeverity;
  animationEnabled: boolean;
  reason: string;
}
