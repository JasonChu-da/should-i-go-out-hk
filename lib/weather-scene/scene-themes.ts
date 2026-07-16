import type { WeatherSceneName } from "@/lib/weather-scene/types";

export type CloudMode = "none" | "few" | "many" | "dense";

export interface WeatherSceneTheme {
  label: string;
  cloudMode: CloudMode;
  mist: boolean;
  skyPulse: boolean;
}

export const WEATHER_SCENE_THEMES: Readonly<
  Record<WeatherSceneName, WeatherSceneTheme>
> = Object.freeze({
  clear: { label: "天色明朗", cloudMode: "few", mist: false, skyPulse: false },
  cloudy: { label: "多雲", cloudMode: "many", mist: false, skyPulse: false },
  overcast: { label: "密雲", cloudMode: "dense", mist: true, skyPulse: false },
  rain: { label: "有雨", cloudMode: "dense", mist: false, skyPulse: false },
  storm: { label: "雷雨或惡劣天氣", cloudMode: "dense", mist: false, skyPulse: true },
  hot: { label: "天氣炎熱", cloudMode: "few", mist: false, skyPulse: false },
  neutral: { label: "天氣資料未能確認", cloudMode: "none", mist: false, skyPulse: false },
});
