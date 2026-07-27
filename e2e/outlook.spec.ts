import { expect, test, type Page } from "@playwright/test";
import type { LocationId } from "../lib/location/districts";
import { buildOutlookFixture } from "./fixtures/outlook";

const APP_ORIGIN = "http://127.0.0.1:3100";

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

test("首頁載入並顯示完整外出判斷", async ({ page }) => {
  await openSuccessfulHomepage(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "香港現在適合出門嗎？" }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "外出分數 7 分" })).toHaveAttribute(
    "aria-valuenow",
    "7",
  );
  await expect(page.getByText("資料齊備")).toBeVisible();
  await expect(page.getByRole("heading", { name: "現在的因素" })).toBeVisible();
  await expect(page.locator(".data-card")).toHaveCount(4);
  await expect(page.getByText("4 個資料來源可用")).toBeVisible();
});

test("切換地區後請求及判斷結果一併更新", async ({ page }) => {
  const requestedLocations = await openSuccessfulHomepage(page);

  await page.getByRole("button", { name: "中西區" }).click();

  await expect(page.getByRole("heading", { name: "中西區" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "外出分數 4 分" })).toBeVisible();
  await expect(page.locator(".result-summary")).toHaveText(
    "錄得 5 毫米雨量，一般外出扣 3 分。",
  );
  await expect(page.locator("#result-title")).toBeFocused();
  expect(requestedLocations).toContain("central-and-western");
});

test("切換外出模式後立即重新計分", async ({ page }) => {
  await openSuccessfulHomepage(page);

  await page.getByRole("button", { name: "跑步／踩單車" }).click();
  await expect(page.getByRole("progressbar", { name: "外出分數 2 分" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "不建議戶外活動" })).toBeVisible();

  await page.getByRole("button", { name: "晾衫" }).click();
  await expect(page.getByRole("progressbar", { name: "外出分數 9 分" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "適合出門", exact: true }),
  ).toBeVisible();
});

test("定位成功時切換至最近的沙田資料", async ({ context, page }) => {
  await context.grantPermissions(["geolocation"], { origin: APP_ORIGIN });
  await context.setGeolocation({ latitude: 22.3872, longitude: 114.1953 });
  const requestedLocations = await mockOutlookApi(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "沙田" })).toBeVisible();
  await expect(page.getByText("已使用定位")).toBeVisible();
  await expect(page.getByText("已按裝置位置選擇最近地區；你可隨時改選。")).toBeVisible();
  expect(requestedLocations).toContain("sha-tin");
});

test("定位被拒絕時顯示清楚 fallback 並可用鍵盤恢復", async ({
  context,
  page,
}) => {
  await context.clearPermissions();
  await mockOutlookApi(page);
  await page.goto("/");

  await expect(page.getByText("定位被拒絕")).toBeVisible();
  await expect(
    page.getByText("位置權限已被拒絕，現先顯示香港整體資料。"),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "一按選擇地區" })).toBeVisible();

  const districtButton = page.getByRole("button", { name: "灣仔" });
  await districtButton.focus();
  await districtButton.press("Enter");

  await expect(page.getByRole("heading", { name: "灣仔" })).toBeVisible();
  await expect(page.getByText("已選擇地區")).toBeVisible();
  await expect(page.locator("#result-title")).toBeFocused();
  await expect
    .poll(() =>
      page.locator("#result-title").evaluate((element) =>
        getComputedStyle(element).outlineStyle,
      ),
    )
    .toBe("solid");
});

test("API 格式錯誤顯示失敗狀態，重試後恢復", async ({ page }) => {
  let recover = false;
  await mockOutlookApi(page, (locationId) =>
    recover
      ? buildOutlookFixture(locationId)
      : { status: "ok", message: "測試用不完整回應" },
  );

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "現在未能可靠評分" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新載入資料" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);

  recover = true;
  await page.getByRole("button", { name: "重新載入資料" }).click();

  await expect(page.getByRole("progressbar", { name: "外出分數 7 分" })).toBeVisible();
  await expect(page.locator("#result-title")).toBeFocused();
});

test("主要互動可用鍵盤操作且 focus 樣式可見", async ({ page }) => {
  await openSuccessfulHomepage(page);

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "跳至主要內容" });
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

  const exerciseButton = page.getByRole("button", { name: "跑步／踩單車" });
  await exerciseButton.focus();
  await exerciseButton.press("Enter");
  await expect(exerciseButton).toHaveAttribute("aria-pressed", "true");
});

test("prefers-reduced-motion 下停用天氣動態", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSuccessfulHomepage(page);

  await expect(page.locator(".weather-scene")).toHaveAttribute("data-motion", "off");
  await expect(
    page.getByRole("button", { name: "動態背景：已減少" }),
  ).toBeVisible();
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

test("360px viewport 沒有水平溢位", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openSuccessfulHomepage(page);

  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(
    dimensions.innerWidth,
  );
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
});
