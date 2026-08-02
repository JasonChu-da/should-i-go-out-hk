import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WEATHER_LAYOUTS,
  WEATHER_PERIODS,
  WEATHER_SCENES,
  weatherBackgroundAsset,
} from "@/lib/weather-scene/background-assets";

describe("weather background assets", () => {
  it("maps all 21 states to 42 unique existing files", () => {
    const paths = WEATHER_PERIODS.flatMap((period) =>
      WEATHER_SCENES.flatMap((scene) =>
        WEATHER_LAYOUTS.map((layout) =>
          weatherBackgroundAsset(period, scene, layout),
        ),
      ),
    );

    expect(paths).toHaveLength(42);
    expect(new Set(paths).size).toBe(42);
    for (const assetPath of paths) {
      expect(existsSync(join(process.cwd(), "public", assetPath))).toBe(true);
    }
  });
});
