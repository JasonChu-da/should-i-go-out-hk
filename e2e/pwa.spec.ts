import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { OutlookPayload } from "../lib/domain/outlook";
import type { LocationId } from "../lib/location/districts";
import { buildOutlookFixture } from "./fixtures/outlook";

const INTERNAL_ORIGIN = `http://127.0.0.1:${process.env.PWA_INTERNAL_PORT ?? "3201"}`;
const MANAGED_CACHE_PREFIX = "go-out-";
const VERSION_V1 = "e2e-v1";
const VERSION_V2 = "e2e-v2";

type ApiMode =
  | { type: "payload"; payload?: OutlookPayload }
  | { type: "http-error"; status: number }
  | { type: "invalid" }
  | { type: "network-error" };

interface ApiRequestRecord {
  location: string | null;
}

interface ManifestIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

interface WebManifest {
  id?: string;
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons?: ManifestIcon[];
}

interface CachedResponse {
  cacheName: string;
  contentType: string;
  url: string;
}

let apiMode: ApiMode;
let apiRequests: ApiRequestRecord[];

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, page, request }) => {
  apiMode = { type: "payload" };
  apiRequests = [];
  await setWorkerVersion(request, VERSION_V1, true);
  await context.clearCookies();
  await page.goto("/__pwa__/blank");
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  });
  await mockOutlookApi(context);
});

async function setWorkerVersion(
  request: APIRequestContext,
  swVersion: string,
  reset = false,
): Promise<void> {
  const response = await request.post("/__pwa__/control", {
    data: reset ? { reset: true, swVersion } : { swVersion },
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ swVersion });
}

async function mockOutlookApi(context: BrowserContext): Promise<void> {
  await context.route("**/api/outlook?*", async (route) => {
    const request = route.request();
    const location = new URL(request.url()).searchParams.get("location");
    apiRequests.push({ location });

    if (apiMode.type === "network-error") {
      await route.abort("internetdisconnected");
      return;
    }
    if (apiMode.type === "http-error") {
      await route.fulfill({
        status: apiMode.status,
        contentType: "application/json; charset=utf-8",
        headers: { "Cache-Control": "private, no-store, max-age=0" },
        body: JSON.stringify({ error: "PWA E2E unavailable" }),
      });
      return;
    }
    if (apiMode.type === "invalid") {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        headers: { "Cache-Control": "private, no-store, max-age=0" },
        body: JSON.stringify({ status: "ok", incomplete: true }),
      });
      return;
    }

    const locationId = (location ?? "hong-kong") as LocationId;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      headers: { "Cache-Control": "private, no-store, max-age=0" },
      body: JSON.stringify(apiMode.payload ?? buildOutlookFixture(locationId)),
    });
  });
}

async function openReadyHomepage(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(1);
}

async function waitForController(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
    )
    .toBe(true);
}

async function expectNoDerivedWeather(page: Page): Promise<void> {
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(
    page.locator(
      ".decision-layout, .rainfall-feature, .metric-summary-card, #result-title",
    ),
  ).toHaveCount(0);
  await expect(page.locator('main[data-scene="neutral"]')).toBeVisible();
  await expect(
    page.locator(
      '.weather-background-layer:not([data-scene="neutral"])',
    ),
  ).toHaveCount(0);
}

async function managedCacheNames(page: Page): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const names = await caches.keys();
    return names.filter((name) => name.startsWith(prefix)).sort();
  }, MANAGED_CACHE_PREFIX);
}

async function cachedResponses(page: Page): Promise<CachedResponse[]> {
  return page.evaluate(async (prefix) => {
    const records: CachedResponse[] = [];
    for (const cacheName of await caches.keys()) {
      if (!cacheName.startsWith(prefix)) continue;
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        records.push({
          cacheName,
          contentType: response?.headers.get("content-type") ?? "",
          url: request.url,
        });
      }
    }
    return records.sort((a, b) =>
      `${a.cacheName}:${a.url}`.localeCompare(`${b.cacheName}:${b.url}`),
    );
  }, MANAGED_CACHE_PREFIX);
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function iconWithPurpose(
  icons: ManifestIcon[],
  size: string,
  purpose: "any" | "maskable",
): ManifestIcon | undefined {
  return icons.find(
    (icon) =>
      icon.sizes?.split(/\s+/).includes(size) &&
      (icon.purpose ?? "any").split(/\s+/).includes(purpose),
  );
}

async function attachMaskablePreview(
  page: Page,
  testInfo: TestInfo,
  iconURL: string,
): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="zh-Hant-HK">
      <style>
        body { background: #e9f4fb; display: flex; gap: 32px; margin: 32px; }
        figure { color: #061827; font: 16px system-ui; margin: 0; text-align: center; }
        .mask { background: #061827; height: 256px; margin-bottom: 8px; overflow: hidden; width: 256px; }
        .circle { border-radius: 50%; }
        .rounded { border-radius: 25%; }
        img { display: block; height: 100%; width: 100%; }
      </style>
      <figure><div class="mask circle"><img src="${iconURL}" alt=""></div><figcaption>圓形裁切</figcaption></figure>
      <figure><div class="mask rounded"><img src="${iconURL}" alt=""></div><figcaption>圓角裁切</figcaption></figure>
    </html>
  `);
  await expect(page.locator("img").first()).toHaveJSProperty("complete", true);
  await expect(page.locator("img").first()).toHaveJSProperty("naturalWidth", 512);
  await testInfo.attach("maskable-icon-crops", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
}

test("manifest、圖示、Apple metadata 及 Chromium 安裝條件完整", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = (await response.json()) as WebManifest;

  expect(manifest).toMatchObject({
    id: "/",
    name: "香港現在適合出門嗎？",
    short_name: "香港出門",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#061827",
    background_color: "#061827",
  });

  const icons = manifest.icons ?? [];
  const icon192 = iconWithPurpose(icons, "192x192", "any");
  const icon512 = iconWithPurpose(icons, "512x512", "any");
  const maskable = iconWithPurpose(icons, "512x512", "maskable");
  expect(icon192).toBeDefined();
  expect(icon512).toBeDefined();
  expect(maskable).toBeDefined();

  for (const [icon, size] of [
    [icon192, 192],
    [icon512, 512],
    [maskable, 512],
  ] as const) {
    expect(icon?.type).toBe("image/png");
    const iconResponse = await request.get(icon!.src);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
    expect(pngDimensions(await iconResponse.body())).toEqual({
      width: size,
      height: size,
    });
  }

  await openReadyHomepage(page);
  await waitForController(page);
  const appleIconURL = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  expect(appleIconURL).toBeTruthy();
  const appleIconResponse = await request.get(appleIconURL!);
  expect(pngDimensions(await appleIconResponse.body())).toEqual({
    width: 180,
    height: 180,
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  const appManifest = await cdp.send("Page.getAppManifest");
  expect(appManifest.errors).toEqual([]);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  expect(installability.installabilityErrors).toEqual([]);

  await attachMaskablePreview(
    page,
    testInfo,
    new URL(maskable!.src, page.url()).href,
  );
});

test("加入主畫面提示只會在未安裝的 iPhone Safari 顯示一次", async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const setUserAgent = (userAgent: string) =>
    cdp.send("Network.setUserAgentOverride", {
      platform: "iPhone",
      userAgent,
    });
  const safariUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  await page.setViewportSize({ width: 390, height: 844 });
  await setUserAgent(safariUserAgent);
  await openReadyHomepage(page);
  const hint = page.locator(
    'aside.ios-install-hint[aria-label="在 iPhone 安裝應用程式"]',
  );
  await expect(hint).toContainText(
    "在 Safari 點「分享」，再選「加入主畫面」。",
  );
  const hintMetrics = await hint.evaluate((element) => {
    const closeButton = element.querySelector("button")?.getBoundingClientRect();
    return {
      closeHeight: closeButton?.height ?? 0,
      closeWidth: closeButton?.width ?? 0,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(hintMetrics.pageWidth).toBe(hintMetrics.viewportWidth);
  expect(hintMetrics.closeHeight).toBeGreaterThanOrEqual(44);
  expect(hintMetrics.closeWidth).toBeGreaterThanOrEqual(44);
  await page
    .getByRole("button", { name: "關閉加入主畫面提示" })
    .click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(hint).toHaveCount(0);

  await page.evaluate(() =>
    localStorage.removeItem("pwa-ios-install-hint-dismissed:v1"),
  );
  await setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1",
  );
  await page.reload();
  await expect(hint).toHaveCount(0);

  await setUserAgent(safariUserAgent);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
  });
  await page.reload();
  await expect(hint).toHaveCount(0);
});

test("localStorage 被封鎖時仍可在本頁關閉動態背景", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });

  await openReadyHomepage(page);
  const toggle = page.getByRole("button", { name: /動態背景/ });
  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute(
    "data-weather-motion",
    "off",
  );
  await expect(page.locator(".weather-scene")).toHaveAttribute(
    "data-motion",
    "off",
  );
});

test("service worker headers、控制狀態及 Cache Storage allowlist 正確", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __pwaApiFetchCacheModes?: Array<RequestCache | null>;
    };
    target.__pwaApiFetchCacheModes = [];
    const nativeFetch = window.fetch;
    window.fetch = (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      if (String(input).includes("/api/outlook")) {
        target.__pwaApiFetchCacheModes?.push(init?.cache ?? null);
      }
      return nativeFetch(...args);
    };
  });

  for (const path of [
    "/",
    "/manifest.webmanifest",
    "/sw.js",
    "/api/outlook?location=invalid",
    "/weather/scenes/day/clear-mobile.webp",
  ]) {
    const response = await request.get(path);
    expect(
      response.headers()["content-security-policy-report-only"],
    ).toBeTruthy();
  }

  const reportResponse = await request.post("/api/csp-report", {
    data: { "csp-report": { "effective-directive": "script-src" } },
  });
  expect(reportResponse.status()).toBe(404);

  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.ok()).toBe(true);
  expect(workerResponse.headers()["content-type"]).toMatch(
    /(?:java|ecma)script/i,
  );
  expect(workerResponse.headers()["cache-control"]).toBe(
    "no-cache, no-store, must-revalidate",
  );
  expect(await workerResponse.text()).toMatch(
    /url\.pathname\.startsWith\("\/api\/"\)[\s\S]+cache:\s*"no-store"/,
  );

  await openReadyHomepage(page);
  await waitForController(page);
  await page.reload();
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();

  const registration = await page.evaluate(async () => {
    const value = await navigator.serviceWorker.getRegistration("/");
    return {
      active: value?.active?.state,
      controller: Boolean(navigator.serviceWorker.controller),
      updateViaCache: value?.updateViaCache,
    };
  });
  expect(registration).toEqual({
    active: "activated",
    controller: true,
    updateViaCache: "none",
  });

  const manifest = (await (await request.get("/manifest.webmanifest")).json()) as WebManifest;
  const iconPaths = new Set(
    (manifest.icons ?? []).map((icon) => new URL(icon.src, page.url()).pathname),
  );
  const records = await cachedResponses(page);
  expect(records.length).toBeGreaterThan(0);

  for (const record of records) {
    const url = new URL(record.url);
    expect(url.origin).toBe(new URL(page.url()).origin);
    expect(url.pathname.startsWith("/api/")).toBe(false);
    expect(url.searchParams.has("location")).toBe(false);
    expect(
      url.pathname === "/offline.html" ||
        url.pathname.startsWith("/_next/static/") ||
        iconPaths.has(url.pathname),
    ).toBe(true);
    if (record.contentType.includes("text/html")) {
      expect(url.pathname).toBe("/offline.html");
    }
  }
  expect(records.some(({ url }) => new URL(url).pathname === "/")).toBe(false);
  expect(
    records.some(({ url }) => new URL(url).pathname === "/offline.html"),
  ).toBe(true);

  expect(apiRequests.length).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __pwaApiFetchCacheModes?: Array<RequestCache | null>;
          }
        ).__pwaApiFetchCacheModes,
    ),
  ).toContain("no-store");
  const invalidApiResponse = await request.get(
    `${INTERNAL_ORIGIN}/api/outlook?location=pwa-e2e-invalid`,
  );
  expect(invalidApiResponse.status()).toBe(400);
  expect(invalidApiResponse.headers()["cache-control"]).toContain("no-store");

  await page.goto("/?location=central-and-western");
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  expect(
    (await cachedResponses(page)).some(({ url }) => {
      const cachedURL = new URL(url);
      return (
        cachedURL.pathname === "/" ||
        cachedURL.searchParams.has("location")
      );
    }),
  ).toBe(false);

  const notFoundResponse = await page.goto("/pwa-e2e-not-found");
  expect(notFoundResponse?.status()).toBe(404);
  await expect(page.locator("#retry-button")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "目前離線" })).toHaveCount(0);
});

test("Service Worker 不會從 Cache Storage 提供舊的天氣 payload", async ({
  page,
}) => {
  await openReadyHomepage(page);
  await waitForController(page);

  const stalePayload = buildOutlookFixture("hong-kong");
  await page.evaluate(async (payload) => {
    const cache = await caches.open("manual-stale-weather");
    await cache.put(
      "/api/outlook?location=hong-kong",
      new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }, stalePayload);

  apiMode = {
    type: "payload",
    payload: buildOutlookFixture("central-and-western"),
  };
  try {
    await page.reload();
    await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("data-scene", "rain");
    expect(
      (await cachedResponses(page)).some(({ url }) =>
        new URL(url).pathname.startsWith("/api/"),
      ),
    ).toBe(false);
  } finally {
    await page.evaluate(() => caches.delete("manual-stale-weather"));
  }
});

test("已載入頁面區分離線與服務不可用，並只在真實成功後恢復", async ({
  context,
  page,
}) => {
  await openReadyHomepage(page);
  await waitForController(page);
  await expect(page.locator(".rainfall-feature")).toHaveCount(1);
  await expect(page.locator(".metric-summary-card")).toHaveCount(3);

  await context.setOffline(true);
  await expect(page.locator('main[data-outlook-state="offline"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "無法取得即時天氣" })).toBeVisible();
  await expect(page.getByText(/最新官方資料時間：/)).toBeVisible();
  await expectNoDerivedWeather(page);

  const requestsBeforeReconnect = apiRequests.length;
  await context.setOffline(false);
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  expect(apiRequests.length).toBeGreaterThan(requestsBeforeReconnect);

  apiMode = { type: "http-error", status: 503 };
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.locator('main[data-outlook-state="unavailable"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "暫時無法取得天氣資料" }),
  ).toBeVisible();
  await expectNoDerivedWeather(page);

  apiMode = { type: "network-error" };
  await page.getByRole("button", { name: /重新載入資料|重新嘗試/ }).click();
  await expect(
    page.locator('main[data-outlook-state="unavailable"]'),
  ).toBeVisible();
  await expectNoDerivedWeather(page);

  apiMode = { type: "payload" };
  await page.getByRole("button", { name: /重新載入資料|重新嘗試/ }).click();
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(1);
});

test("離線事件會失效化未完成請求，延遲回應不能恢復舊畫面", async ({
  page,
}) => {
  await openReadyHomepage(page);
  await page.evaluate(() => {
    const target = window as typeof window & {
      __delayedApiStarted?: boolean;
      __delayedApiSettled?: boolean;
      __releaseDelayedApi?: () => void;
    };
    const nativeFetch = window.fetch;
    window.fetch = (input, init) => {
      if (!String(input).includes("/api/outlook")) {
        return nativeFetch(input, init);
      }
      target.__delayedApiStarted = true;
      return new Promise<Response>((resolve, reject) => {
        target.__releaseDelayedApi = () => {
          void nativeFetch(input, { ...init, signal: undefined }).then(
            (response) => {
              target.__delayedApiSettled = true;
              resolve(response);
            },
            reject,
          );
        };
      });
    };
  });

  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => page.evaluate(() => Boolean(
      (window as typeof window & { __delayedApiStarted?: boolean })
        .__delayedApiStarted,
    )))
    .toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator('main[data-outlook-state="offline"]')).toBeVisible();

  await page.evaluate(() => {
    const target = window as typeof window & {
      __releaseDelayedApi?: () => void;
    };
    target.__releaseDelayedApi?.();
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(
      (window as typeof window & { __delayedApiSettled?: boolean })
        .__delayedApiSettled,
    )))
    .toBe(true);
  await page.waitForTimeout(100);

  await expect(page.locator('main[data-outlook-state="offline"]')).toBeVisible();
  await expectNoDerivedWeather(page);
});

test("較舊的延遲請求不會覆蓋較新的地區結果", async ({
  context,
  page,
}) => {
  await context.unroute("**/api/outlook?*");
  let markOldStarted: () => void = () => undefined;
  const oldStarted = new Promise<void>((resolve) => {
    markOldStarted = resolve;
  });
  let releaseOld: () => void = () => undefined;
  const oldRelease = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let markOldFinished: () => void = () => undefined;
  const oldFinished = new Promise<void>((resolve) => {
    markOldFinished = resolve;
  });

  await context.route("**/api/outlook?*", async (route) => {
    const location = new URL(route.request().url()).searchParams.get(
      "location",
    ) as LocationId | null;
    apiRequests.push({ location });

    if (location === "hong-kong") {
      markOldStarted();
      await oldRelease;
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          headers: { "Cache-Control": "private, no-store, max-age=0" },
          body: JSON.stringify(buildOutlookFixture("hong-kong")),
        });
      } catch {
        // The app normally aborts this route as soon as the newer request starts.
      } finally {
        markOldFinished();
      }
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      headers: { "Cache-Control": "private, no-store, max-age=0" },
      body: JSON.stringify(
        buildOutlookFixture(location ?? "central-and-western"),
      ),
    });
  });

  await page.goto("/");
  await oldStarted;
  await page.getByRole("button", { name: /香港整體/ }).click();
  const districtButton = page.getByRole("button", {
    name: "中西區",
    exact: true,
  });
  await expect(districtButton).toBeVisible();
  await districtButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect(page.locator(".location-name")).toHaveText("中西區");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );

  releaseOld();
  await oldFinished;
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  await expect(page.locator(".location-name")).toHaveText("中西區");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
});

test("冷啟動離線頁的按鈕及重新連線探測可用", async ({
  context,
  page,
}) => {
  await openReadyHomepage(page);
  await waitForController(page);
  await page.close();

  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto("/");
  await expect(
    offlinePage.getByRole("heading", { name: "目前離線" }),
  ).toBeVisible();
  await expect(offlinePage.getByText(/無法取得即時天氣/)).toBeVisible();
  const retry = offlinePage.locator("#retry-button");
  await expect(retry).toHaveText("重新嘗試");
  await retry.click();
  await expect(
    offlinePage.getByRole("heading", { name: "目前離線" }),
  ).toBeVisible();

  await context.setOffline(false);
  await offlinePage.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    offlinePage.locator('main[data-outlook-state="ready"]'),
  ).toBeVisible();
});

test("同一 /sw.js URL 的新版會 waiting，全部舊分頁關閉後才 activate", async ({
  context,
  page,
  request,
}) => {
  await openReadyHomepage(page);
  await waitForController(page);
  await page.reload();
  await expect(page.locator('main[data-outlook-state="ready"]')).toBeVisible();
  const oldCacheRecords = (await cachedResponses(page)).filter(({ cacheName }) =>
    cacheName.includes(VERSION_V1),
  );
  expect(oldCacheRecords.length).toBeGreaterThan(0);

  await page.evaluate(async () => {
    const unrelated = await caches.open("unrelated-e2e-cache");
    await unrelated.put("/unrelated", new Response("keep"));
  });

  const secondPage = await context.newPage();
  await openReadyHomepage(secondPage);
  await waitForController(secondPage);

  await setWorkerVersion(request, VERSION_V2);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    await registration?.update();
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration("/");
        return registration?.waiting?.state ?? null;
      }),
    )
    .toBe("installed");

  const whileWaiting = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    return {
      active: registration?.active?.state,
      controlled: navigator.serviceWorker.controller === registration?.active,
      updateViaCache: registration?.updateViaCache,
      waiting: registration?.waiting?.state,
    };
  });
  expect(whileWaiting).toEqual({
    active: "activated",
    controlled: true,
    updateViaCache: "none",
    waiting: "installed",
  });

  const waitingCacheNames = await managedCacheNames(page);
  expect(waitingCacheNames.some((name) => name.includes(VERSION_V1))).toBe(true);
  expect(waitingCacheNames.some((name) => name.includes(VERSION_V2))).toBe(true);
  expect(
    (await cachedResponses(page)).filter(({ cacheName }) =>
      cacheName.includes(VERSION_V1),
    ),
  ).toEqual(oldCacheRecords);

  const observerPage = await context.newPage();
  await secondPage.close();
  await page.close();

  const updatedPage = observerPage;
  await expect(async () => {
    await updatedPage.goto("/", { timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
  await expect(
    updatedPage.locator('main[data-outlook-state="ready"]'),
  ).toBeVisible();
  await expect(updatedPage.getByRole("progressbar")).toHaveCount(1);
  await waitForController(updatedPage);
  await expect
    .poll(() =>
      updatedPage.evaluate(async () => {
        const registration =
          await navigator.serviceWorker.getRegistration("/");
        return registration?.waiting?.state ?? null;
      }),
    )
    .toBeNull();

  const activeCacheNames = await managedCacheNames(updatedPage);
  expect(activeCacheNames.some((name) => name.includes(VERSION_V1))).toBe(false);
  expect(activeCacheNames.some((name) => name.includes(VERSION_V2))).toBe(true);
  expect(await updatedPage.evaluate(() => caches.has("unrelated-e2e-cache"))).toBe(
    true,
  );
});
