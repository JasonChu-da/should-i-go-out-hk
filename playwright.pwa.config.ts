import { defineConfig, devices } from "@playwright/test";

const proxyPort = process.env.PWA_PROXY_PORT ?? "3200";
const baseURL = `http://127.0.0.1:${proxyPort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "pwa.spec.ts",
  globalSetup: "./e2e/global-setup.mjs",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/pwa" }],
  ],
  outputDir: "test-results/pwa",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "zh-HK",
    timezoneId: "Asia/Hong_Kong",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "pwa-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
