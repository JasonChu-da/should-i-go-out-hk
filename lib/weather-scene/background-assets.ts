import type {
  WeatherPeriod,
  WeatherSceneName,
} from "@/lib/weather-scene/types";

export const WEATHER_PERIODS = ["day", "dusk", "night"] as const;
export const WEATHER_SCENES = [
  "clear",
  "cloudy",
  "overcast",
  "rain",
  "storm",
  "hot",
  "neutral",
] as const;
export const WEATHER_LAYOUTS = ["mobile", "desktop"] as const;

export type WeatherBackgroundLayout = (typeof WEATHER_LAYOUTS)[number];

export function weatherBackgroundAsset(
  period: WeatherPeriod,
  scene: WeatherSceneName,
  layout: WeatherBackgroundLayout,
): string {
  return `/weather/scenes/${period}/${scene}-${layout}.webp`;
}
