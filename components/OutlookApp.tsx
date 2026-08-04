"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DataCards } from "@/components/DataCards";
import {
  DistrictPicker,
  LocationControls,
  type LocationUiStatus,
  type PickerPhase,
} from "@/components/LocationControls";
import { ModeTabs } from "@/components/ModeTabs";
import { ResultHero } from "@/components/ResultHero";
import { SourceDetails } from "@/components/SourceDetails";
import { DataFailureState, LoadingState } from "@/components/States";
import { ActiveWarnings, ForecastDetails } from "@/components/WarningsPanel";
import {
  MotionToggle,
  useMotionPreference,
  usePrefersReducedMotion,
} from "@/components/weather-scene/MotionToggle";
import { WeatherScene } from "@/components/weather-scene/WeatherScene";
import type { OutlookPayload } from "@/lib/domain/outlook";
import {
  getDistrictById,
  HONG_KONG_WIDE,
  type LocationId,
} from "@/lib/location/districts";
import { requestDistrictFromGeolocation } from "@/lib/location/geolocation";
import { fetchOutlookRoute } from "@/lib/outlook/browser-client";
import { toScoringInput } from "@/lib/outlook/scoring-input";
import { formatHktTime } from "@/lib/presentation/format";
import { scoreOutlook } from "@/lib/scoring/score";
import { ACTIVITY_MODES, type ActivityMode } from "@/lib/scoring/types";
import { deriveWeatherScene } from "@/lib/weather-scene/derive-weather-scene";
import type { WeatherPeriod } from "@/lib/weather-scene/types";

type OutlookViewStatus = "loading" | "ready" | "offline" | "unavailable";

interface RouteResponseState {
  status: OutlookViewStatus;
  payload: OutlookPayload | null;
}

export const LAST_PUBLIC_UPDATE_STORAGE_KEY = "pwa-last-public-update:v1";
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function locationLabel(locationId: LocationId): string {
  return locationId === HONG_KONG_WIDE.id
    ? HONG_KONG_WIDE.nameTc
    : (getDistrictById(locationId)?.nameTc ?? HONG_KONG_WIDE.nameTc);
}

function timestampValue(timestamp: string | null): number | null {
  if (!timestamp || !ISO_TIMESTAMP.test(timestamp)) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function storedPublicUpdate(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const storedUpdate = window.localStorage.getItem(
      LAST_PUBLIC_UPDATE_STORAGE_KEY,
    );
    return timestampValue(storedUpdate) === null ? null : storedUpdate;
  } catch {
    return null;
  }
}

export function latestPublishedAt(payload: OutlookPayload): string | null {
  let latest: string | null = null;
  let latestValue = Number.NEGATIVE_INFINITY;

  for (const source of payload.sources) {
    // Warning normalization falls back to retrievedAt when no entry has an
    // official issue/update time; that confirmation time is not a publication.
    if (
      source.id === "warnings" &&
      source.publishedAt === source.retrievedAt &&
      source.rawPublishedAt === source.retrievedAt
    ) {
      continue;
    }
    const value = timestampValue(source.publishedAt);
    if (value !== null && value > latestValue) {
      latest = source.publishedAt;
      latestValue = value;
    }
  }

  return latest;
}

interface PartialDataNotice {
  title: string;
  message: string;
}

interface PickerFrame {
  width: number;
  height: number;
}

const PICKER_OPEN_DURATION_MS = 360;
const PICKER_CLOSE_DURATION_MS = 260;

function partialDataNotice(
  payload: OutlookPayload,
): PartialDataNotice | null {
  const degraded = payload.sources.filter(
    (source) => source.status !== "ok" || source.issues.length > 0,
  );
  if (
    degraded.length === 0 ||
    !degraded.every((source) => source.id === "rainfallNowcast")
  ) {
    return {
      title: "部分官方資料暫時不可用",
      message: "只按可確認的觀測判斷風險；評分所需資料不足時會限制結論信心。",
    };
  }

  const status = payload.rainfallNowcast.forecast.status;
  if (status === "fresh") return null;

  const message = "目前分數仍按已確認的即時觀測及警告計算。";
  if (status === "stale") {
    return {
      title: "未來降雨預報更新較慢",
      message: `過時資料不會計入分數。${message}`,
    };
  }
  if (status === "malformed") {
    return {
      title: "未來降雨預報資料暫時無法讀取",
      message,
    };
  }
  return { title: "暫時未能取得未來降雨預報", message };
}

interface OutlookAppProps {
  initialPeriod: WeatherPeriod;
}

export default function OutlookApp({ initialPeriod }: OutlookAppProps) {
  const [locationId, setLocationId] = useState<LocationId>(HONG_KONG_WIDE.id);
  const [locationStatus, setLocationStatus] = useState<LocationUiStatus>("locating");
  const [pickerPhase, setPickerPhase] = useState<PickerPhase>("closed");
  const [mode, setMode] = useState<ActivityMode>("general");
  const [routeResponse, setRouteResponse] = useState<RouteResponseState>({
    status: "loading",
    payload: null,
  });
  const [lastPublicUpdate, setLastPublicUpdate] =
    useState<string | null>(storedPublicUpdate);
  const locationRequested = useRef(false);
  const manualSelection = useRef(false);
  const currentLocationId = useRef<LocationId>(HONG_KONG_WIDE.id);
  const locationTrigger = useRef<HTMLButtonElement>(null);
  const locationPanel = useRef<HTMLElement>(null);
  const pickerAnimation = useRef<Animation | null>(null);
  const pickerAnimationStart = useRef<PickerFrame | null>(null);
  const shouldMoveFocus = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const [motionEnabled, setMotionEnabled] = useMotionPreference();
  const reducedMotion = usePrefersReducedMotion();
  const pickerMounted = pickerPhase !== "closed";
  const pickerExpanded = pickerPhase === "opening" || pickerPhase === "open";

  const capturePickerFrame = useCallback((): PickerFrame | null => {
    const panel = locationPanel.current;
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const openPicker = useCallback(() => {
    pickerAnimationStart.current = capturePickerFrame();
    pickerAnimation.current?.cancel();
    pickerAnimation.current = null;
    setPickerPhase("opening");
  }, [capturePickerFrame]);

  const closePicker = useCallback(
    (restoreFocus = false) => {
      if (pickerPhase === "closed" || pickerPhase === "closing") return;
      pickerAnimationStart.current = capturePickerFrame();
      pickerAnimation.current?.cancel();
      pickerAnimation.current = null;
      setPickerPhase("closing");
      if (restoreFocus) locationTrigger.current?.focus();
    },
    [capturePickerFrame, pickerPhase],
  );

  const togglePicker = useCallback(() => {
    if (pickerExpanded) {
      closePicker();
      return;
    }
    openPicker();
  }, [closePicker, openPicker, pickerExpanded]);

  const loadOutlook = useCallback((nextLocationId: LocationId) => {
    const nextRequestId = requestId.current + 1;
    requestId.current = nextRequestId;
    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;

    void Promise.resolve()
      .then(() => {
        if (requestId.current !== nextRequestId) return null;
        setRouteResponse({ status: "loading", payload: null });
        return fetchOutlookRoute(nextLocationId, {
          signal: controller.signal,
        });
      })
      .then((response) => {
        if (!response) return;
        if (
          requestId.current !== nextRequestId ||
          (!response.ok && response.error.type === "aborted")
        ) {
          return;
        }

        activeRequest.current = null;

        if (response.ok && response.payload.status !== "error") {
          const latestUpdate = latestPublishedAt(response.payload);
          if (latestUpdate) {
            setLastPublicUpdate(latestUpdate);
            try {
              window.localStorage.setItem(
                LAST_PUBLIC_UPDATE_STORAGE_KEY,
                latestUpdate,
              );
            } catch {
              // Storage may be unavailable in private browsing.
            }
          }
          setRouteResponse({ status: "ready", payload: response.payload });
          return;
        }

        setRouteResponse({
          status:
            !response.ok && response.error.type === "network"
              ? navigator.onLine
                ? "unavailable"
                : "offline"
              : "unavailable",
          payload: null,
        });
      });
  }, []);

  useEffect(() => {
    if (locationRequested.current) return;
    locationRequested.current = true;

    void requestDistrictFromGeolocation().then((result) => {
      if (manualSelection.current) return;

      if (result.status === "success") {
        // getNearestDistrict only returns entries from the canonical DISTRICTS list.
        const nextLocationId = result.district.id as LocationId;
        currentLocationId.current = nextLocationId;
        setLocationId(nextLocationId);
        setLocationStatus("located");
        loadOutlook(nextLocationId);
        return;
      }

      currentLocationId.current = HONG_KONG_WIDE.id;
      setLocationId(HONG_KONG_WIDE.id);
      setLocationStatus(result.status);
      pickerAnimation.current?.cancel();
      setPickerPhase("closed");
    });
  }, [loadOutlook]);

  useEffect(() => {
    loadOutlook(HONG_KONG_WIDE.id);
  }, [loadOutlook]);

  useEffect(() => {
    const handleOffline = () => {
      requestId.current += 1;
      activeRequest.current?.abort();
      activeRequest.current = null;
      setRouteResponse({ status: "offline", payload: null });
    };
    const handleOnline = () => {
      loadOutlook(currentLocationId.current);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [loadOutlook]);

  useEffect(
    () => () => {
      requestId.current += 1;
      activeRequest.current?.abort();
      pickerAnimation.current?.cancel();
    },
    [],
  );

  useLayoutEffect(() => {
    if (pickerPhase === "closed" || pickerPhase === "open") {
      pickerAnimation.current?.cancel();
      pickerAnimation.current = null;
      return;
    }

    const panel = locationPanel.current;
    const trigger = locationTrigger.current;
    const nextPhase = pickerPhase === "opening" ? "open" : "closed";
    const from = pickerAnimationStart.current;
    if (!panel || !trigger || !from || reducedMotion || !panel.animate) {
      setPickerPhase(nextPhase);
      return;
    }

    const targetRect =
      pickerPhase === "opening"
        ? panel.getBoundingClientRect()
        : trigger.getBoundingClientRect();
    const panelStyle = getComputedStyle(panel);
    const targetWidth =
      targetRect.width +
      (pickerPhase === "closing"
        ? parseFloat(panelStyle.borderLeftWidth) +
          parseFloat(panelStyle.borderRightWidth)
        : 0);
    const targetHeight =
      targetRect.height +
      (pickerPhase === "closing"
        ? parseFloat(panelStyle.borderTopWidth) +
          parseFloat(panelStyle.borderBottomWidth)
        : 0);
    const opening = pickerPhase === "opening";
    const widthOvershoot = Math.min(4, targetWidth * 0.004);
    const heightOvershoot = Math.min(4, targetHeight * 0.008);
    const keyframes: Keyframe[] = opening
      ? [
          {
            width: `${from.width}px`,
            height: `${from.height}px`,
            offset: 0,
          },
          {
            width: `${targetWidth + widthOvershoot}px`,
            height: `${targetHeight + heightOvershoot}px`,
            offset: 0.84,
          },
          {
            width: `${targetWidth}px`,
            height: `${targetHeight}px`,
            offset: 1,
          },
        ]
      : [
          {
            width: `${from.width}px`,
            height: `${from.height}px`,
          },
          {
            width: `${targetWidth}px`,
            height: `${targetHeight}px`,
          },
        ];
    const animation = panel.animate(keyframes, {
      duration: opening
        ? PICKER_OPEN_DURATION_MS
        : PICKER_CLOSE_DURATION_MS,
      easing: opening
        ? "cubic-bezier(0.2, 0.82, 0.25, 1)"
        : "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "both",
    });

    pickerAnimation.current = animation;
    animation.onfinish = () => {
      if (pickerAnimation.current === animation) setPickerPhase(nextPhase);
    };
  }, [pickerPhase, reducedMotion]);

  useEffect(() => {
    if (!pickerExpanded) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closePicker(true);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closePicker, pickerExpanded]);

  const viewStatus = routeResponse.status;
  const loading = viewStatus === "loading";
  const payload = viewStatus === "ready" ? routeResponse.payload : null;

  const result = useMemo(() => {
    if (!payload) return null;
    return scoreOutlook(toScoringInput(payload), mode);
  }, [mode, payload]);

  useEffect(() => {
    if (viewStatus === "loading" || !shouldMoveFocus.current) return;

    const target = document.getElementById(
      result ? "result-title" : "complete-failure-title",
    );
    target?.focus();
    shouldMoveFocus.current = false;
  }, [result, viewStatus]);

  const selectLocation = (nextLocationId: LocationId) => {
    manualSelection.current = true;
    shouldMoveFocus.current = true;
    currentLocationId.current = nextLocationId;
    setLocationId(nextLocationId);
    setLocationStatus("manual");
    closePicker(true);
    loadOutlook(nextLocationId);
  };

  const retry = () => {
    shouldMoveFocus.current = true;
    loadOutlook(currentLocationId.current);
  };
  const latestUpdate = payload ? latestPublishedAt(payload) : null;
  const locationNote =
    payload?.location.note ??
    (locationId === HONG_KONG_WIDE.id
      ? "非地區化結果；即時雨量及 AQHI 採用全港有效資料中的保守代表值，未來降雨採用十八區代表格點最高值。"
      : "按地區即時雨量、最近預報格點及官方代表監測站評估。");
  const weatherScene = useMemo(
    () => deriveWeatherScene(payload, initialPeriod),
    [initialPeriod, payload],
  );
  const partialNotice =
    payload?.status === "partial" ? partialDataNotice(payload) : null;

  return (
    <>
    <WeatherScene
      scene={weatherScene}
      motionEnabled={motionEnabled}
      reducedMotion={reducedMotion}
    />
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <main
      className="app-shell"
      id="main-content"
      tabIndex={-1}
      data-outlook-state={viewStatus}
      data-scene={weatherScene.scene}
      data-period={weatherScene.period}
    >
      <header className="site-header">
        <div className="site-header-copy">
          <p className="brand-kicker">出門前，望一望</p>
          <h1>香港現在適合出門嗎？</h1>
        </div>
        <MotionToggle
          enabled={motionEnabled}
          reducedMotion={reducedMotion}
          onChange={setMotionEnabled}
        />
      </header>

      <div
        className="quick-controls-anchor"
        data-open={pickerMounted}
        data-phase={pickerPhase}
      >
        {pickerMounted ? (
          <button
            className="quick-controls-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="關閉地區及活動選擇"
            data-phase={pickerPhase}
            onClick={() => closePicker(true)}
          />
        ) : null}
        <LocationControls
          locationLabel={payload?.location.label ?? locationLabel(locationId)}
          modeLabel={ACTIVITY_MODES.find((option) => option.id === mode)?.label ?? "一般外出"}
          locationNote={locationNote}
          status={locationStatus}
          pickerPhase={pickerPhase}
          triggerRef={locationTrigger}
          panelRef={locationPanel}
          onTogglePicker={togglePicker}
          updateLabel={
            latestUpdate
              ? `更新於 ${formatHktTime(latestUpdate)}`
              : viewStatus === "loading"
                ? "正在更新…"
                : viewStatus === "offline"
                  ? "目前離線"
                  : "資料暫不可用"
          }
        >
          {pickerMounted ? (
            <div
              className="quick-controls"
              id="quick-controls"
              data-phase={pickerPhase}
              aria-hidden={pickerPhase === "closing"}
              inert={pickerPhase === "closing"}
            >
              <div className="quick-control-section">
                <p>活動模式</p>
                <ModeTabs
                  mode={mode}
                  onChange={(nextMode) => {
                    setMode(nextMode);
                    closePicker(true);
                  }}
                />
              </div>
              <DistrictPicker locationId={locationId} onSelect={selectLocation} />
            </div>
          ) : null}
        </LocationControls>
      </div>

      {loading ? <LoadingState /> : null}

      {viewStatus === "offline" ? (
        <DataFailureState
          kind="offline"
          lastPublicUpdate={lastPublicUpdate}
          onRetry={retry}
        />
      ) : null}

      {viewStatus === "unavailable" ? (
        <DataFailureState
          kind="unavailable"
          lastPublicUpdate={lastPublicUpdate}
          onRetry={retry}
        />
      ) : null}

      {partialNotice ? (
        <div className="partial-banner" role="status">
          <div>
            <strong>
              <span aria-hidden="true">!</span>{" "}
              {partialNotice.title}
            </strong>
            <p>{partialNotice.message}</p>
          </div>
          <button className="text-button" type="button" onClick={retry}>重試資料</button>
        </div>
      ) : null}

      {payload && result ? (
        <div className="decision-layout">
          <div className="decision-primary">
            <ResultHero result={result} mode={mode} />
            <ActiveWarnings warnings={payload.warnings} />
          </div>
          <DataCards
            weather={payload.weather}
            aqhi={payload.aqhi}
            rainfallNowcast={payload.rainfallNowcast}
            location={payload.location}
            generatedAt={payload.generatedAt}
          />
        </div>
      ) : null}

      {payload && result ? (
        <div className="utility-layout">
          <ForecastDetails forecast={payload.forecast} weather={payload.weather} />
          <SourceDetails sources={payload.sources} />
        </div>
      ) : null}

      <footer className="site-footer">
        <p><strong>資料限制：</strong>即時地區雨量是過去一小時紀錄；未來降雨是約 2 公里格點的臨時自動預報，可能受地形及快速發展雨區影響。濕度及紫外線亦不一定代表你所在位置。</p>
        <p>本網站只提供一般資訊，不是專業氣象、醫療或緊急安全建議。惡劣天氣時請以香港天文台及政府指示為準。</p>
        <div className="footer-links">
          <a href="https://www.hko.gov.hk/tc/index.html" target="_blank" rel="noreferrer">香港天文台<span className="sr-only">（在新分頁開啟）</span></a>
          <a href="https://www.aqhi.gov.hk/tc.html" target="_blank" rel="noreferrer">空氣質素健康指數<span className="sr-only">（在新分頁開啟）</span></a>
        </div>
      </footer>
    </main>
    </>
  );
}
