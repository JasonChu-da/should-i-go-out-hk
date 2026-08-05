import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { metadata } from "@/app/layout";
import manifest from "@/app/manifest";
import {
  LAST_PUBLIC_UPDATE_STORAGE_KEY,
} from "@/components/OutlookApp";
import {
  IOS_INSTALL_HINT_STORAGE_KEY,
  isIosInstallHintDismissed,
  rememberIosInstallHintDismissed,
  shouldShowIosInstallHint,
} from "@/components/PwaClient";
import { DataFailureState } from "@/components/States";
import { buildOutlookFixture } from "@/e2e/fixtures/outlook";
import { formatHktDateTime } from "@/lib/presentation/format";
import { latestPublishedAt } from "@/lib/outlook/publication-time";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 " +
  "Mobile/15E148 Safari/604.1";

describe("PWA client UI", () => {
  it("declares a standalone manifest with installable and maskable icons", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: "香港現在適合出門嗎？",
      short_name: "香港出門",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#061827",
      background_color: "#061827",
      icons: expect.arrayContaining([
        expect.objectContaining({
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ]),
    });
  });

  it("declares the manifest and explicit Apple web app metadata", () => {
    expect(metadata.manifest).toBe("/manifest.webmanifest");
    expect(metadata.icons).toEqual({
      apple: [
        {
          url: "/icons/apple-touch-icon-v1.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    });
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      statusBarStyle: "black",
      title: "香港出門",
    });
  });

  it("shows the install hint only in iPhone or iPod Safari outside standalone", () => {
    const eligible = {
      userAgent: IPHONE_SAFARI,
      navigatorStandalone: false,
      displayModeStandalone: false,
      dismissed: false,
    };

    expect(shouldShowIosInstallHint(eligible)).toBe(true);
    expect(
      shouldShowIosInstallHint({
        ...eligible,
        userAgent: IPHONE_SAFARI.replace("iPhone", "iPod"),
      }),
    ).toBe(true);
    expect(
      shouldShowIosInstallHint({
        ...eligible,
        userAgent: IPHONE_SAFARI.replace(
          "Version/17.4",
          "CriOS/126.0.6478.153",
        ),
      }),
    ).toBe(false);
    expect(
      shouldShowIosInstallHint({
        ...eligible,
        userAgent: IPHONE_SAFARI.replace("Version/17.4", "FxiOS/127.0"),
      }),
    ).toBe(false);
    expect(
      shouldShowIosInstallHint({
        ...eligible,
        userAgent: IPHONE_SAFARI.replace("Version/17.4", "EdgiOS/126.0"),
      }),
    ).toBe(false);
    expect(
      shouldShowIosInstallHint({
        ...eligible,
        navigatorStandalone: true,
      }),
    ).toBe(false);
    expect(
      shouldShowIosInstallHint({
        ...eligible,
        displayModeStandalone: true,
      }),
    ).toBe(false);
    expect(shouldShowIosInstallHint({ ...eligible, dismissed: true })).toBe(
      false,
    );
  });

  it("keeps the install hint usable when local storage is blocked", () => {
    const blockedWindow = {
      get localStorage(): Storage {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    expect(isIosInstallHintDismissed(blockedWindow)).toBe(false);
    expect(() => rememberIosInstallHintDismissed(blockedWindow)).not.toThrow();

    const storage = {
      getItem: vi.fn(() => "true"),
      setItem: vi.fn(),
    };
    const availableWindow = {
      localStorage: storage as unknown as Storage,
    };
    expect(isIosInstallHintDismissed(availableWindow)).toBe(true);
    rememberIosInstallHintDismissed(availableWindow);
    expect(storage.getItem).toHaveBeenCalledWith(
      IOS_INSTALL_HINT_STORAGE_KEY,
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      IOS_INSTALL_HINT_STORAGE_KEY,
      "true",
    );
  });

  it("selects only the latest valid official publication timestamp", () => {
    const payload = buildOutlookFixture("hong-kong");
    payload.sources[0].publishedAt = "invalid";
    payload.sources[1].publishedAt = "July 30, 2026";
    payload.sources[2].publishedAt = "2026-07-29T14:10:00.000Z";

    expect(latestPublishedAt(payload)).toBe("2026-07-29T14:10:00.000Z");
    expect(LAST_PUBLIC_UPDATE_STORAGE_KEY).toBe(
      "pwa-last-public-update:v1",
    );
  });

  it("does not label an empty-warning retrieval fallback as official publication time", () => {
    const payload = buildOutlookFixture("hong-kong");
    payload.warnings.items = [];
    for (const source of payload.sources) {
      source.publishedAt =
        source.id === "warnings"
          ? "2026-07-29T15:00:00.000Z"
          : "2026-07-29T14:10:00.000Z";
      if (source.id === "warnings") {
        source.retrievedAt = source.publishedAt;
        source.rawPublishedAt = source.publishedAt;
      }
    }

    expect(latestPublishedAt(payload)).toBe("2026-07-29T14:10:00.000Z");
  });

  it("distinguishes offline from unavailable without rendering weather data", () => {
    const offline = renderToStaticMarkup(
      <DataFailureState
        kind="offline"
        lastPublicUpdate="2026-07-29T14:10:00.000Z"
        onRetry={vi.fn()}
      />,
    );
    const unavailable = renderToStaticMarkup(
      <DataFailureState kind="unavailable" onRetry={vi.fn()} />,
    );

    expect(offline).toContain('data-state="offline"');
    expect(offline).toContain("無法取得即時天氣");
    expect(offline).toContain("網絡中斷期間不會顯示舊天氣或分數");
    expect(offline).toContain(
      "最新官方資料時間：7月29日 22:10",
    );
    expect(formatHktDateTime("2026-07-29T14:10:00.000Z")).toBe(
      "7月29日 22:10",
    );
    expect(offline).toContain("重新嘗試");
    expect(offline).not.toContain("離線資料");

    expect(unavailable).toContain('data-state="unavailable"');
    expect(unavailable).toContain("暫時無法取得天氣資料");
    expect(unavailable).toContain("重新載入資料");
    expect(unavailable).not.toContain("目前離線");
  });
});
