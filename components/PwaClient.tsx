"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

export const IOS_INSTALL_HINT_STORAGE_KEY =
  "pwa-ios-install-hint-dismissed:v1";

interface IosInstallHintEnvironment {
  userAgent: string;
  navigatorStandalone: boolean;
  displayModeStandalone: boolean;
  dismissed: boolean;
}

type StorageWindow = Pick<Window, "localStorage">;

export function isIosInstallHintDismissed(target: StorageWindow): boolean {
  try {
    return (
      target.localStorage.getItem(IOS_INSTALL_HINT_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

export function rememberIosInstallHintDismissed(target: StorageWindow): void {
  try {
    target.localStorage.setItem(IOS_INSTALL_HINT_STORAGE_KEY, "true");
  } catch {
    // Dismissing for this page is enough when storage is unavailable.
  }
}

export function shouldShowIosInstallHint({
  userAgent,
  navigatorStandalone,
  displayModeStandalone,
  dismissed,
}: IosInstallHintEnvironment): boolean {
  return (
    /iPhone|iPod/i.test(userAgent) &&
    /Version\/[\d.]+.*Safari\//i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS/i.test(userAgent) &&
    !navigatorStandalone &&
    !displayModeStandalone &&
    !dismissed
  );
}

export function PwaClient() {
  const [showInstallHint, setShowInstallHint] = useState(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const standaloneNavigator = navigator as Navigator & {
      standalone?: boolean;
    };
    let mounted = true;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      setShowInstallHint(
        shouldShowIosInstallHint({
          userAgent: navigator.userAgent,
          navigatorStandalone: standaloneNavigator.standalone === true,
          displayModeStandalone:
            window.matchMedia?.("(display-mode: standalone)").matches ?? false,
          dismissed: isIosInstallHintDismissed(window),
        }),
      );
    });
    return () => {
      mounted = false;
    };
  }, []);

  const dismiss = () => {
    setShowInstallHint(false);
    rememberIosInstallHintDismissed(window);
  };

  if (!showInstallHint) return null;

  return (
    <aside className="ios-install-hint" aria-label="在 iPhone 安裝應用程式">
      <p>
        <strong>加入主畫面</strong>
        <span>在 Safari 點「分享」，再選「加入主畫面」。</span>
      </p>
      <button type="button" aria-label="關閉加入主畫面提示" onClick={dismiss}>
        <AppIcon name="close" />
      </button>
    </aside>
  );
}
