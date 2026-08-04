import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type {
  OutlookPayload,
  RainfallNowcastValue,
} from "../lib/domain/outlook";
import type { LocationId } from "../lib/location/districts";
import type { WeatherPeriod } from "../lib/weather-scene/types";
import { buildOutlookFixture } from "./fixtures/outlook";
import { hongKongWeatherPeriod } from "../lib/weather-scene/hong-kong-period";

const APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

type ApiResponder = (
  locationId: LocationId,
  requestIndex: number,
) => unknown;

let unexpectedBrowserErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  unexpectedBrowserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      unexpectedBrowserErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    unexpectedBrowserErrors.push(`pageerror: ${error.message}`);
  });
});

test.afterEach(() => {
  expect(unexpectedBrowserErrors).toEqual([]);
});

async function mockOutlookApi(
  page: Page,
  responder: ApiResponder = (locationId) =>
    buildOutlookFixture(locationId),
): Promise<string[]> {
  const requestedLocations: string[] = [];

  await page.route("**/api/outlook?*", async (route) => {
    const url = new URL(route.request().url());
    const locationId = (url.searchParams.get("location") ??
      "hong-kong") as LocationId;
    const requestIndex = requestedLocations.length;
    requestedLocations.push(locationId);

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(responder(locationId, requestIndex)),
    });
  });

  return requestedLocations;
}

async function openSuccessfulHomepage(page: Page): Promise<string[]> {
  const requestedLocations = await mockOutlookApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "可以出門，但需要準備" })).toBeVisible();
  return requestedLocations;
}

async function expectNoA11yViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

async function expectBackgroundSource(page: Page, path: string): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(".weather-background-layer.is-current .weather-background-image")
        .evaluate((image: HTMLImageElement) =>
          image.currentSrc ? new URL(image.currentSrc).pathname : "",
        ),
    )
    .toBe(path);
}

async function expectBackgroundSourceOneOf(
  page: Page,
  paths: readonly string[],
): Promise<void> {
  await expect
    .poll(async () => {
      const currentPath = await page
        .locator(".weather-background-layer.is-current .weather-background-image")
        .evaluate((image: HTMLImageElement) =>
          image.currentSrc ? new URL(image.currentSrc).pathname : "",
        );
      return paths.includes(currentPath);
    })
    .toBe(true);
}

async function expectBackgroundSceneAsset(
  page: Page,
  assetScene: string,
  layout: "mobile" | "desktop",
): Promise<void> {
  await expect
    .poll(() =>
      page.locator(".weather-background-layer.is-current").evaluate(
        (layer, expected) => {
          const period = layer.getAttribute("data-period");
          const image = layer.querySelector(".weather-background-image");
          const currentPath = image
            ? (image as HTMLImageElement).currentSrc
              ? new URL((image as HTMLImageElement).currentSrc).pathname
              : ""
            : "";
          return (
            period !== null &&
            currentPath ===
              `/weather/scenes/${period}/${expected.assetScene}-${expected.layout}.webp`
          );
        },
        { assetScene, layout },
      ),
    )
    .toBe(true);
}

function clearBackgroundPath(
  period: WeatherPeriod,
  layout: "mobile" | "desktop",
): string {
  return `/weather/scenes/${period}/clear-${layout}.webp`;
}

async function expectRainCanvas(page: Page, visible: boolean): Promise<void> {
  await expect
    .poll(() =>
      page.locator(".rain-canvas").evaluate((canvas: HTMLCanvasElement) => {
        if (canvas.width === 0 || canvas.height === 0) return false;
        const context = canvas.getContext("2d");
        if (!context) return false;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) return true;
        }
        return false;
      }),
    )
    .toBe(visible);
}

async function selectPreviewScene(page: Page, id: string): Promise<void> {
  const button = page.getByRole("button").filter({ hasText: id });
  await expect
    .poll(
      async () => {
        if ((await button.getAttribute("aria-pressed")) !== "true") {
          await button.click();
        }
        return button.getAttribute("aria-pressed");
      },
      { timeout: 5_000 },
    )
    .toBe("true");
}

function withFutureRain(payload: OutlookPayload): OutlookPayload {
  const forecast = payload.rainfallNowcast.forecast;
  if (!forecast.value) throw new Error("E2E fixture 缺少降雨預報");
  const amounts = [0, 1.8, 0, 0] as const;
  const periods = forecast.value.periods.map((period, index) => ({
    ...period,
    rainfallMm: amounts[index],
  })) as unknown as RainfallNowcastValue["periods"];

  return {
    ...payload,
    rainfallNowcast: {
      ...payload.rainfallNowcast,
      forecast: {
        ...forecast,
        value: {
          ...forecast.value,
          periods,
          firstRainWindow: {
            firstPeriodIndex: 1,
            lastPeriodIndex: 1,
          },
          peakRainPeriodIndex: 1,
        },
      },
    },
  };
}

function withDegradedNowcast(
  payload: OutlookPayload,
  status: "stale" | "failed" | "malformed",
): OutlookPayload {
  const stale = status === "stale";
  const issue =
    status === "malformed"
      ? "未來降雨預報資料格式異常。"
      : status === "failed"
        ? "未來降雨預報服務回應逾時。"
        : "";
  const source = {
    ...payload.rainfallNowcast.source,
    status: stale ? ("stale" as const) : ("unavailable" as const),
    publishedAt: stale ? payload.rainfallNowcast.source.publishedAt : null,
    rawPublishedAt: stale
      ? payload.rainfallNowcast.source.rawPublishedAt
      : null,
    issues: issue ? [issue] : [],
  };
  return {
    ...payload,
    status: "partial",
    rainfallNowcast: {
      forecast: {
        ...payload.rainfallNowcast.forecast,
        status,
        value: stale ? payload.rainfallNowcast.forecast.value : null,
        label: "未來降雨預報",
        place: stale ? payload.rainfallNowcast.forecast.place : null,
        publishedAt: stale
          ? payload.rainfallNowcast.forecast.publishedAt
          : null,
        rawPublishedAt: stale
          ? payload.rainfallNowcast.forecast.rawPublishedAt
          : null,
        message: stale ? "資料可能已過時，不會用於計分。" : issue,
      },
      source,
    },
    sources: payload.sources.map((item) =>
      item.id === "rainfallNowcast" ? source : item,
    ),
  };
}

function withThunderstormWarning(payload: OutlookPayload): OutlookPayload {
  return {
    ...payload,
    warnings: {
      ...payload.warnings,
      items: [
        {
          family: "WTS",
          code: "WTS",
          name: "雷暴警告",
          actionCode: "ISSUE",
          type: "雷暴警告",
          issueTime: "2026-07-27T05:30:00.000Z",
          updateTime: "2026-07-27T05:55:00.000Z",
          expireTime: null,
        },
      ],
    },
  };
}

function withStaleIconFreshObservedRain(
  payload: OutlookPayload,
  rainfallMm = 1.2,
): OutlookPayload {
  return {
    ...payload,
    weather: {
      ...payload.weather,
      conditionIcons: {
        ...payload.weather.conditionIcons,
        status: "stale",
        value: [62],
        message: "天氣圖示可能已過時，不會單獨用於場景判斷。",
      },
      rainfallMm: {
        ...payload.weather.rainfallMm,
        status: "fresh",
        value: rainfallMm,
        message: "資料在可接受更新時間內。",
      },
      icons: [62],
    },
  };
}

function withRecoverableNowcastIssue(
  payload: OutlookPayload,
): OutlookPayload {
  const source = {
    ...payload.rainfallNowcast.source,
    issues: ["已略過非代表格點的無效雨量。"],
  };
  return {
    ...payload,
    status: "partial",
    rainfallNowcast: { ...payload.rainfallNowcast, source },
    sources: payload.sources.map((item) =>
      item.id === "rainfallNowcast" ? source : item,
    ),
  };
}

function withUnavailableWarnings(payload: OutlookPayload): OutlookPayload {
  const source = {
    ...payload.warnings.source,
    status: "unavailable" as const,
    issues: ["警告服務暫時不可用。"],
  };
  return {
    ...payload,
    status: "partial",
    warnings: {
      items: [],
      isSnapshotComplete: false,
      source,
    },
    sources: payload.sources.map((item) =>
      item.id === "warnings" ? source : item,
    ),
  };
}

test("首頁載入並顯示完整外出判斷", async ({ page }) => {
  await openSuccessfulHomepage(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "香港現在適合出門嗎？" }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "外出分數 7 分" })).toHaveAttribute(
    "aria-valuenow",
    "7",
  );
  await expect(page.locator(".result-topline")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "跑步／踩單車" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "現在的狀況" })).toBeVisible();
  await expect(page.locator(".rainfall-feature")).toHaveCount(1);
  await expect(page.locator(".metric-summary-card")).toHaveCount(3);
  await expect(page.locator(".rainfall-bars > li")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "生效中的天氣警告" })).toHaveCount(0);
  await expect(page.getByText("5 個資料來源可用")).toBeVisible();
  await expectBackgroundSource(page, "/weather/scenes/day/clear-desktop.webp");
  await expectNoA11yViolations(page);
});

test("離線狀態沒有 axe 可偵測的無障礙問題", async ({ page }) => {
  await openSuccessfulHomepage(page);

  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator('main[data-outlook-state="offline"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "無法取得即時天氣" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("picture 按 viewport 載入原生手機或桌面背景", async ({ page }) => {
  await mockOutlookApi(page);
  for (const viewport of [
    { width: 390, height: 844, layout: "mobile" },
    { width: 768, height: 1024, layout: "mobile" },
    { width: 1280, height: 720, layout: "desktop" },
    { width: 1920, height: 1080, layout: "desktop" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
    await expectBackgroundSource(
      page,
      `/weather/scenes/day/clear-${viewport.layout}.webp`,
    );
  }
});

for (const viewport of [
  { width: 390, height: 844, layout: "mobile" },
  { width: 1440, height: 900, layout: "desktop" },
] as const) {
  test(`載入期間顯示 ${viewport.layout} neutral 背景再切換實際場景`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const periodBefore = hongKongWeatherPeriod(new Date().toISOString()) ?? "day";
    const requestedBackgrounds: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/weather/scenes/")) {
        requestedBackgrounds.push(pathname);
      }
    });
    let releaseApi!: () => void;
    const apiGate = new Promise<void>((resolve) => {
      releaseApi = resolve;
    });
    await page.route("**/api/outlook?*", async (route) => {
      await apiGate;
      const locationId = (new URL(route.request().url()).searchParams.get(
        "location",
      ) ?? "hong-kong") as LocationId;
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(buildOutlookFixture(locationId)),
      });
    });

    await page.goto("/");
    const periodAfter = hongKongWeatherPeriod(new Date().toISOString()) ?? "day";
    const allowedInitialPaths = [
      clearBackgroundPath(periodBefore, viewport.layout),
      clearBackgroundPath(periodAfter, viewport.layout),
    ];
    await expect(page.locator('main[data-outlook-state="loading"]')).toBeVisible();
    await expectBackgroundSourceOneOf(page, allowedInitialPaths);
    releaseApi();
    await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
    await expectBackgroundSource(
      page,
      `/weather/scenes/day/clear-${viewport.layout}.webp`,
    );
    await expect(
      page.locator(
        ".weather-background-layer.is-current .weather-background-image",
      ),
    ).toHaveJSProperty("complete", true);

    expect(
      allowedInitialPaths.some((path) => requestedBackgrounds.includes(path)),
    ).toBe(true);
    expect(requestedBackgrounds).toContain(
      `/weather/scenes/day/clear-${viewport.layout}.webp`,
    );
    expect(requestedBackgrounds.some((path) => path.includes("/neutral-"))).toBe(
      false,
    );
  });
}

test("目前天氣背景載入完成前持續顯示 neutral 背景", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseBackground!: () => void;
  const backgroundGate = new Promise<void>((resolve) => {
    releaseBackground = resolve;
  });
  await page.route("**/weather/scenes/day/clear-mobile.webp", async (route) => {
    await backgroundGate;
    await route.continue();
  });
  await mockOutlookApi(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(
    page.locator('.weather-background-layer.is-previous[data-scene="neutral"]'),
  ).toHaveCSS("opacity", "1");
  await expect(
    page.locator('.weather-background-layer.is-current[data-scene="clear"]'),
  ).toHaveCSS("opacity", "0");

  releaseBackground();
  await expect(
    page.locator('.weather-background-layer.is-current[data-scene="clear"]'),
  ).toHaveCSS("opacity", "1");
  await expect(page.locator(".weather-background-layer.is-previous")).toHaveCount(0);
});

test("背景圖片失敗時保留純色 fallback 且不顯示破圖", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOutlookApi(page);
  await page.route("**/weather/scenes/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/webp", body: "" }),
  );

  await page.goto("/");
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".weather-background-image").evaluateAll((images) =>
        images.length > 0 &&
        images.every(
          (image) => getComputedStyle(image).visibility === "hidden",
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator(".weather-background")).toHaveCSS(
    "background-color",
    "rgb(6, 24, 39)",
  );
  await page.locator(".motion-toggle").click();
  await expect(page.locator(".weather-scene")).toHaveAttribute(
    "data-motion",
    "off",
  );
});

test("Weather Scene Preview 可驗收全部 21 個背景狀態", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/scene-preview");

  for (const period of ["day", "dusk", "night"]) {
    for (const scene of [
      "clear",
      "cloudy",
      "overcast",
      "rain",
      "storm",
      "hot",
      "neutral",
    ]) {
      const id = `${scene}-${period}`;
      await selectPreviewScene(page, id);
      await expectBackgroundSource(
        page,
        `/weather/scenes/${period}/${scene === "neutral" ? "clear" : scene}-desktop.webp`,
      );
    }
  }
});

test("切換地區後請求及判斷結果一併更新", async ({ page }) => {
  const requestedLocations = await openSuccessfulHomepage(page);

  await page.getByRole("button", { name: /香港整體/ }).click();
  await page.getByRole("button", { name: "中西區" }).click();

  await expect(page.locator(".location-name")).toHaveText("中西區");
  await expect(page.getByRole("progressbar", { name: "外出分數 4 分" })).toBeVisible();
  await expect(page.locator(".result-summary")).toHaveText(
    "錄得 5 毫米雨量，一般外出扣 3 分。",
  );
  await expect(page.locator(".location-pill")).toBeFocused();
  expect(requestedLocations).toContain("central-and-western");
});

test("同一頁面可由 clear 切換 rain、storm 再回到 clear", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOutlookApi(page, (locationId) => {
    if (locationId === "central-and-western") {
      return withStaleIconFreshObservedRain(buildOutlookFixture(locationId));
    }
    if (locationId === "wan-chai") {
      return withThunderstormWarning(buildOutlookFixture(locationId));
    }
    return buildOutlookFixture(locationId);
  });

  await page.goto("/");
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-scene", "clear");
  await expectBackgroundSource(page, "/weather/scenes/day/clear-mobile.webp");
  await expectRainCanvas(page, false);

  await page.getByRole("button", { name: /香港整體/ }).click();
  await page.getByRole("button", { name: "中西區" }).click();
  await expect(page.locator(".location-name")).toHaveText("中西區");
  await expect(page.locator("main")).toHaveAttribute("data-scene", "rain");
  await expectBackgroundSource(page, "/weather/scenes/day/rain-mobile.webp");
  await expectRainCanvas(page, true);

  await page.getByRole("button", { name: /中西區/ }).click();
  await page.getByRole("button", { name: "灣仔" }).click();
  await expect(page.locator(".location-name")).toHaveText("灣仔");
  await expect(page.locator("main")).toHaveAttribute("data-scene", "storm");
  await expectBackgroundSource(page, "/weather/scenes/day/storm-mobile.webp");
  await expectRainCanvas(page, true);

  await page.getByRole("button", { name: /灣仔/ }).click();
  await page.getByRole("button", { name: "沙田" }).click();
  await expect(page.locator(".location-name")).toHaveText("沙田");
  await expect(page.locator("main")).toHaveAttribute("data-scene", "clear");
  await expectBackgroundSource(page, "/weather/scenes/day/clear-mobile.webp");
  await expectRainCanvas(page, false);
});

test("SSR neutral 會在 client 取得新鮮降雨後切換 rain", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const periodBefore = hongKongWeatherPeriod(new Date().toISOString()) ?? "day";
  const backgroundRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/weather/scenes/") && pathname.endsWith(".webp")) {
      backgroundRequests.push(pathname);
    }
  });
  let releaseApi!: () => void;
  const apiGate = new Promise<void>((resolve) => {
    releaseApi = resolve;
  });
  await page.route("**/api/outlook?*", async (route) => {
    await apiGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(
        withStaleIconFreshObservedRain(buildOutlookFixture("hong-kong")),
      ),
    });
  });

  await page.goto("/");
  const periodAfter = hongKongWeatherPeriod(new Date().toISOString()) ?? "day";
  await expect(page.locator('main[data-outlook-state="loading"]')).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-scene", "neutral");
  await expectBackgroundSourceOneOf(page, [
    clearBackgroundPath(periodBefore, "mobile"),
    clearBackgroundPath(periodAfter, "mobile"),
  ]);
  expect(backgroundRequests.some((path) => path.includes("/neutral-"))).toBe(false);
  expect(backgroundRequests.some((path) => path.endsWith("clear-mobile.webp"))).toBe(true);
  expect(backgroundRequests.some((path) => path.endsWith("clear-desktop.webp"))).toBe(false);

  releaseApi();
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-scene", "rain");
  await expectBackgroundSource(page, "/weather/scenes/day/rain-mobile.webp");
  await expectRainCanvas(page, true);
});

test("資料取得失敗時由 rain 回到 neutral 且不殘留雨線", async ({ page }) => {
  let failWanChai = false;
  await mockOutlookApi(page, (locationId) => {
    if (locationId === "central-and-western") {
      return withStaleIconFreshObservedRain(buildOutlookFixture(locationId));
    }
    if (locationId === "wan-chai" && failWanChai) {
      return { status: "ok", message: "測試用不完整回應" };
    }
    return buildOutlookFixture(locationId);
  });

  await page.goto("/");
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await page.getByRole("button", { name: /香港整體/ }).click();
  await page.getByRole("button", { name: "中西區" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-scene", "rain");
  await expectRainCanvas(page, true);

  failWanChai = true;
  await page.getByRole("button", { name: /中西區/ }).click();
  await page.getByRole("button", { name: "灣仔" }).click();
  await expect(page.locator('main[data-outlook-state="unavailable"]')).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-scene", "neutral");
  await expectBackgroundSceneAsset(page, "clear", "desktop");
  await expectRainCanvas(page, false);
});

test("切換外出模式後立即重新計分", async ({ page }) => {
  await openSuccessfulHomepage(page);

  await page.getByRole("button", { name: /香港整體/ }).click();
  await page.getByRole("button", { name: "跑步／踩單車" }).click();
  await expect(page.getByRole("progressbar", { name: "外出分數 2 分" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "不建議戶外活動" })).toBeVisible();

  await page.getByRole("button", { name: /香港整體/ }).click();
  await page.getByRole("button", { name: "晾衫" }).click();
  await expect(page.getByRole("progressbar", { name: "外出分數 9 分" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "適合出門", exact: true }),
  ).toBeVisible();
});

test("地區膠囊原地展開並覆蓋內容", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSuccessfulHomepage(page);

  const trigger = page.locator(".location-pill");
  const decision = page.locator(".decision-layout");
  const decisionTop = await decision.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  const collapsedWidth = await trigger.evaluate(
    (element) => element.parentElement!.getBoundingClientRect().width,
  );
  await trigger.focus();
  const collapsedStyle = await page.evaluate(() => {
    const panel = document.querySelector(".location-panel")!;
    const pill = document.querySelector(".location-pill")!;
    return {
      panelRadius: getComputedStyle(panel).borderRadius,
      panelOutline: getComputedStyle(panel).outlineStyle,
      pillOutline: getComputedStyle(pill).outlineStyle,
    };
  });

  expect(collapsedStyle.panelRadius).toBe("25px");
  expect(collapsedStyle.panelOutline).toBe("solid");
  expect(collapsedStyle.pillOutline).toBe("none");

  const picker = page.locator(".quick-controls");
  await trigger.evaluate((element: HTMLButtonElement) => element.click());
  await expect
    .poll(() =>
      page
        .locator(".location-panel")
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(collapsedWidth);
  const openingLayout = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell")!.getBoundingClientRect();
    const panel = document.querySelector(".location-panel")!;
    return {
      phase: panel.getAttribute("data-phase"),
      panelWidth: panel.getBoundingClientRect().width,
      shellWidth: shell.width,
      panelRadius: getComputedStyle(panel).borderRadius,
      panelOutline: getComputedStyle(panel).outlineStyle,
      pillOutline: getComputedStyle(
        document.querySelector(".location-pill")!,
      ).outlineStyle,
      hasRunningAnimation: panel
        .getAnimations()
        .some((animation) => animation.playState === "running"),
    };
  });

  await expect(picker).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "地區及活動選擇" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(
    dialog.locator('.district-button[aria-pressed="true"]'),
  ).toBeFocused();
  await expect(page.locator(".site-header")).toHaveAttribute("inert", "");
  await expect(page.locator(".app-content")).toHaveAttribute("inert", "");

  const motionToggle = page.locator(".motion-toggle");
  await motionToggle.evaluate((element: HTMLButtonElement) => element.focus());
  await expect(motionToggle).not.toBeFocused();

  const lastDistrict = page.getByRole("button", { name: "離島區" });
  await lastDistrict.focus();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(lastDistrict).toBeFocused();

  expect(openingLayout.phase).toBe("opening");
  expect(openingLayout.panelWidth).toBeGreaterThan(collapsedWidth);
  expect(openingLayout.panelWidth).toBeLessThan(openingLayout.shellWidth);
  expect(openingLayout.panelRadius).toBe("25px");
  expect(openingLayout.panelOutline).toBe("none");
  expect(openingLayout.pillOutline).toBe("none");
  await expect(
    dialog.locator('.district-button[aria-pressed="true"]'),
  ).toHaveCSS("outline-style", "solid");
  expect(openingLayout.hasRunningAnimation).toBe(true);
  await expect(page.locator(".location-panel")).toHaveAttribute(
    "data-phase",
    "open",
  );

  const desktopLayout = await page.evaluate(() => {
    const shellElement = document.querySelector(".app-shell")!;
    const shell = shellElement.getBoundingClientRect();
    const shellStyle = getComputedStyle(shellElement);
    const panel = document
      .querySelector('.location-panel[data-open="true"]')!
      .getBoundingClientRect();
    const decisionRect = document
      .querySelector(".decision-layout")!
      .getBoundingClientRect();
    return {
      shellWidth: shell.width,
      shellContentWidth:
        shell.width -
        parseFloat(shellStyle.paddingLeft) -
        parseFloat(shellStyle.paddingRight),
      panelWidth: panel.width,
      panelBottom: panel.bottom,
      decisionTop: decisionRect.top,
      panelRadius: getComputedStyle(
        document.querySelector(".location-panel")!,
      ).borderRadius,
    };
  });

  expect(desktopLayout.decisionTop).toBeCloseTo(decisionTop, 0);
  expect(desktopLayout.panelWidth).toBeCloseTo(
    desktopLayout.shellContentWidth,
    0,
  );
  expect(desktopLayout.panelBottom).toBeGreaterThan(desktopLayout.decisionTop);
  expect(desktopLayout.panelRadius).toBe("25px");

  await trigger.evaluate((element: HTMLButtonElement) => element.click());
  await page.waitForTimeout(60);
  expect(
    await page.locator(".location-panel").evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  ).toBe("25px");
  await trigger.evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.locator(".location-panel")).toHaveAttribute(
    "data-phase",
    "open",
  );
  await expect(picker).toHaveCount(1);
  await expect(page.locator(".quick-controls-backdrop")).toHaveCount(1);

  await trigger.click();
  await expect(picker).toHaveCount(0);

  await trigger.click();
  await page.getByRole("button", { name: "灣仔" }).focus();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page
    .locator(".quick-controls-backdrop")
    .click({ position: { x: 100, y: 600 } });
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 360, height: 568 });
  await trigger.click();
  await expect(page.locator(".location-panel")).toHaveAttribute(
    "data-phase",
    "open",
  );
  const mobileLayout = await page.evaluate(() => {
    const anchor = document
      .querySelector(".quick-controls-anchor")!
      .getBoundingClientRect();
    const panel = document
      .querySelector('.location-panel[data-open="true"]')!
      .getBoundingClientRect();
    const controls = document.querySelector(".quick-controls")!;
    return {
      anchorWidth: anchor.width,
      panelWidth: panel.width,
      controlsClientHeight: controls.clientHeight,
      controlsScrollHeight: controls.scrollHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });

  expect(mobileLayout.panelWidth).toBeCloseTo(mobileLayout.anchorWidth, 0);
  expect(mobileLayout.controlsScrollHeight).toBeGreaterThan(
    mobileLayout.controlsClientHeight,
  );
  expect(mobileLayout.documentScrollWidth).toBeLessThanOrEqual(
    mobileLayout.innerWidth,
  );
  await expectNoA11yViolations(page);
});

test("未來一小時雨訊號更新 Hero 及降雨卡，但不把背景當作正在下雨", async ({
  page,
}) => {
  await mockOutlookApi(page, (locationId) =>
    withFutureRain(buildOutlookFixture(locationId)),
  );
  await page.goto("/");

  await expect(
    page.getByRole("progressbar", { name: "外出分數 6 分" }),
  ).toBeVisible();
  await expect(page.locator(".result-summary")).toContainText(
    "香港部分地區約 30–60 分鐘內可能有雨",
  );
  await expect(
    page.getByText("香港部分地區約 30–60 分鐘內可能有雨", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("約 30–60 分鐘內最高半小時預測雨量約 1.8 毫米", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#main-content")).not.toHaveAttribute(
    "data-scene",
    "rain",
  );
});

for (const scenario of [
  { status: "stale", title: "未來降雨預報更新較慢" },
  { status: "failed", title: "暫時未能取得未來降雨預報" },
  { status: "malformed", title: "未來降雨預報資料暫時無法讀取" },
] as const) {
  test(`未來降雨預報 ${scenario.status} 時顯示準確提示並維持現有分數`, async ({
    page,
  }) => {
    await mockOutlookApi(page, (locationId) =>
      withDegradedNowcast(
        buildOutlookFixture(locationId),
        scenario.status,
      ),
    );
    await page.goto("/");

    await expect(page.getByText(scenario.title)).toBeVisible();
    await expect(
      page.getByText(/目前分數仍按已確認的即時觀測及警告計算。/),
    ).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "外出分數 7 分" }),
    ).toBeVisible();
    await expect(page.locator(".result-topline")).toHaveCount(0);
  });
}

test("非關鍵 nowcast issue 不顯示全頁警示", async ({ page }) => {
  await mockOutlookApi(page, (locationId) =>
    withRecoverableNowcastIssue(buildOutlookFixture(locationId)),
  );
  await page.goto("/");

  await expect(page.locator(".partial-banner")).toHaveCount(0);
  await expect(page.getByText("5 個資料來源可用")).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "外出分數 7 分" }),
  ).toBeVisible();
});

test("定位成功時切換至最近的沙田資料", async ({ context, page }) => {
  await context.grantPermissions(["geolocation"], { origin: APP_ORIGIN });
  await context.setGeolocation({ latitude: 22.3872, longitude: 114.1953 });
  const requestedLocations = await mockOutlookApi(page);

  await page.goto("/");

  await expect(page.locator(".location-name")).toHaveText("沙田");
  await expect(page.locator(".location-detail")).toContainText("已使用定位");
  expect(requestedLocations).toContain("sha-tin");
});

test("定位被拒絕時顯示清楚 fallback 並可用鍵盤恢復", async ({
  context,
  page,
}) => {
  await context.clearPermissions();
  await mockOutlookApi(page);
  await page.goto("/");

  await expect(page.locator(".location-detail")).toContainText("定位被拒絕");
  await expect(page.getByRole("region", { name: "一按選擇地區" })).toHaveCount(0);
  await page.getByRole("button", { name: /香港整體/ }).click();
  await expect(page.getByRole("region", { name: "一按選擇地區" })).toBeVisible();

  const districtButton = page.getByRole("button", { name: "灣仔" });
  await districtButton.focus();
  await districtButton.press("Enter");

  await expect(page.locator(".location-name")).toHaveText("灣仔");
  await expect(page.locator(".location-detail")).toContainText("已選擇地區");
  await expect(page.locator(".location-pill")).toBeFocused();
});

test("生效警告才顯示雙格區，未能確認時改顯示審慎提示", async ({ page }) => {
  await mockOutlookApi(page, (locationId, requestIndex) =>
    requestIndex === 0
      ? withThunderstormWarning(buildOutlookFixture(locationId))
      : withUnavailableWarnings(buildOutlookFixture(locationId)),
  );
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "生效中的天氣警告" })).toBeVisible();
  await expect(page.locator(".warning-tile")).toHaveCount(1);
  await expect(page.locator(".warning-tile")).toContainText("雷暴警告");
  await expectBackgroundSource(page, "/weather/scenes/day/storm-desktop.webp");

  await page.getByRole("button", { name: /香港整體/ }).click();
  await page.getByRole("button", { name: "灣仔" }).click();
  await expect(page.getByText("未能完整確認目前天氣警告")).toBeVisible();
});

test("API 格式錯誤顯示失敗狀態，重試後恢復", async ({ page }) => {
  let recover = false;
  await mockOutlookApi(page, (locationId) =>
    recover
      ? buildOutlookFixture(locationId)
      : { status: "ok", message: "測試用不完整回應" },
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "暫時無法取得天氣資料" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重新載入資料" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expectNoA11yViolations(page);

  recover = true;
  await page.getByRole("button", { name: "重新載入資料" }).click();

  await expect(page.getByRole("progressbar", { name: "外出分數 7 分" })).toBeVisible();
  await expect(page.locator("#result-title")).toBeFocused();
});

test("主要互動可用鍵盤操作且 focus 樣式可見", async ({ browserName, page }) => {
  await openSuccessfulHomepage(page);

  const skipLink = page.getByRole("link", { name: "跳至主要內容" });
  if (browserName === "webkit") {
    test.info().annotations.push({
      type: "browser limitation",
      description:
        "Playwright WebKit cannot enable Safari's full keyboard access preference, so the skip-link starts from explicit focus.",
    });
    await skipLink.focus();
  } else {
    await page.keyboard.press("Tab");
  }
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS("opacity", "1");
  await expect(skipLink).toHaveCSS("outline-style", "solid");

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.keyboard.press("Tab");

  const motionToggle = page.locator(".motion-toggle");
  await expect(motionToggle).toBeFocused();
  await expect(motionToggle).toHaveAccessibleName("動態背景：開");
  await page.keyboard.press("Space");
  await expect(motionToggle).toHaveAttribute("aria-pressed", "false");
  await expect(motionToggle).toHaveAccessibleName("動態背景：關");

  await page.getByRole("button", { name: /香港整體/ }).click();
  const exerciseButton = page.getByRole("button", { name: "跑步／踩單車" });
  await exerciseButton.focus();
  await exerciseButton.press("Enter");
  await expect(page.locator(".location-pill")).toHaveAccessibleName(
    /香港整體 跑步／踩單車/,
  );
});

test("prefers-reduced-motion 下停用天氣動態", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockOutlookApi(page, () =>
    withStaleIconFreshObservedRain(buildOutlookFixture("hong-kong")),
  );
  await page.goto("/");
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect(page.locator(".weather-scene")).toHaveAttribute(
    "data-scene",
    "rain",
  );
  await expectBackgroundSource(
    page,
    "/weather/scenes/day/rain-desktop.webp",
  );
  await expectRainCanvas(page, false);

  await expect(page.locator(".weather-scene")).toHaveAttribute("data-motion", "off");
  await expect(
    page.getByRole("button", { name: "動態背景：已減少" }),
  ).toBeVisible();
  await page.locator(".location-pill").click();
  await expect(page.locator(".location-panel")).toHaveAttribute(
    "data-phase",
    "open",
  );
  expect(
    await page.locator(".location-panel").evaluate((element) =>
      element
        .getAnimations()
        .some((animation) => animation.playState === "running"),
    ),
  ).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
});

test("主要 viewport 沒有水平溢位且手機首屏可完成決策", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openSuccessfulHomepage(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "stable");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 416, height: 896 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(
      dimensions.innerWidth,
    );
    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(
      dimensions.innerWidth,
    );
  }

  await page.setViewportSize({ width: 360, height: 800 });
  const mobileLayout = await page.evaluate(() => ({
    decisionBottom:
      document.querySelector(".score-details")?.getBoundingClientRect().bottom ??
      Number.POSITIVE_INFINITY,
    minimumControlHeight: Math.min(
      ...Array.from(
        document.querySelectorAll(".motion-toggle, .location-pill, .mode-tab"),
      ).map((element) => element.getBoundingClientRect().height),
    ),
  }));

  expect(mobileLayout.decisionBottom).toBeLessThanOrEqual(800);
  expect(mobileLayout.minimumControlHeight).toBeGreaterThanOrEqual(44);
});
