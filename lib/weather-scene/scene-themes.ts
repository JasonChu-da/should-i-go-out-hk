import type { WeatherSceneName } from "@/lib/weather-scene/types";

export type CloudMode = "none" | "few" | "many" | "dense";

export interface WeatherSceneTheme {
  cloudMode: CloudMode;
  mist: boolean;
  skyPulse: boolean;
}

export const WEATHER_SCENE_THEMES: Readonly<
  Record<WeatherSceneName, WeatherSceneTheme>
> = Object.freeze({
  clear: { cloudMode: "few", mist: false, skyPulse: false },
  cloudy: { cloudMode: "many", mist: false, skyPulse: false },
  overcast: { cloudMode: "dense", mist: true, skyPulse: false },
  rain: { cloudMode: "dense", mist: false, skyPulse: false },
  storm: { cloudMode: "dense", mist: false, skyPulse: true },
  hot: { cloudMode: "few", mist: false, skyPulse: false },
  neutral: { cloudMode: "none", mist: false, skyPulse: false },
});
