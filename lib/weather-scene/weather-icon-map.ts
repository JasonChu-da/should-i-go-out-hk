import type {
  WeatherPrecipitation,
  WeatherSceneName,
  WeatherSceneSeverity,
} from "@/lib/weather-scene/types";

export interface WeatherIconSceneRule {
  scene: Exclude<WeatherSceneName, "neutral">;
  precipitation: WeatherPrecipitation;
  severity: WeatherSceneSeverity;
  caption: string;
  priority: number;
}

/**
 * HKO icon meanings are documented at
 * https://www.weather.gov.hk/tc/textonly/explain/wxicon.htm.
 * Icons that only describe wind, humidity, haze or temperature are omitted
 * unless they can safely select one of this product's scene categories.
 */
export const HKO_WEATHER_ICON_MAP: Readonly<
  Partial<Record<number, WeatherIconSceneRule>>
> = Object.freeze({
  50: { scene: "clear", precipitation: "none", severity: "normal", caption: "陽光充沛", priority: 300 },
  51: { scene: "cloudy", precipitation: "none", severity: "normal", caption: "間有陽光", priority: 410 },
  52: { scene: "cloudy", precipitation: "none", severity: "normal", caption: "短暫陽光", priority: 420 },
  53: { scene: "rain", precipitation: "light", severity: "normal", caption: "間有陽光及幾陣驟雨", priority: 710 },
  54: { scene: "rain", precipitation: "light", severity: "normal", caption: "短暫陽光及有驟雨", priority: 720 },
  60: { scene: "cloudy", precipitation: "none", severity: "normal", caption: "多雲", priority: 430 },
  61: { scene: "overcast", precipitation: "none", severity: "normal", caption: "密雲", priority: 520 },
  62: { scene: "rain", precipitation: "light", severity: "normal", caption: "微雨", priority: 730 },
  63: { scene: "rain", precipitation: "medium", severity: "normal", caption: "有雨", priority: 740 },
  64: { scene: "rain", precipitation: "heavy", severity: "caution", caption: "大雨", priority: 750 },
  65: { scene: "storm", precipitation: "heavy", severity: "caution", caption: "雷暴", priority: 850 },
  70: { scene: "clear", precipitation: "none", severity: "normal", caption: "夜間天色良好", priority: 300 },
  71: { scene: "clear", precipitation: "none", severity: "normal", caption: "夜間天色良好", priority: 300 },
  72: { scene: "clear", precipitation: "none", severity: "normal", caption: "夜間天色良好", priority: 300 },
  73: { scene: "clear", precipitation: "none", severity: "normal", caption: "夜間天色良好", priority: 300 },
  74: { scene: "clear", precipitation: "none", severity: "normal", caption: "夜間天色良好", priority: 300 },
  75: { scene: "clear", precipitation: "none", severity: "normal", caption: "夜間天色良好", priority: 300 },
  76: { scene: "cloudy", precipitation: "none", severity: "normal", caption: "夜間大致多雲", priority: 430 },
  77: { scene: "clear", precipitation: "none", severity: "normal", caption: "夜間天色大致良好", priority: 310 },
  83: { scene: "overcast", precipitation: "none", severity: "normal", caption: "有霧", priority: 510 },
  84: { scene: "overcast", precipitation: "none", severity: "normal", caption: "有薄霧", priority: 505 },
  90: { scene: "hot", precipitation: "none", severity: "caution", caption: "天氣炎熱", priority: 620 },
});

export function findHighestPriorityWeatherIcon(
  icons: readonly number[],
): WeatherIconSceneRule | null {
  let selected: WeatherIconSceneRule | null = null;

  for (const icon of icons) {
    const rule = HKO_WEATHER_ICON_MAP[icon];
    if (rule && (selected === null || rule.priority > selected.priority)) {
      selected = rule;
    }
  }

  return selected;
}
