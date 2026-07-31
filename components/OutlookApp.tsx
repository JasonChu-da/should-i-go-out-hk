"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataCards } from "@/components/DataCards";
import {
  DistrictPicker,
  LocationControls,
  type LocationUiStatus,
} from "@/components/LocationControls";
import { ModeTabs } from "@/components/ModeTabs";
import { ResultHero } from "@/components/ResultHero";
import { SourceDetails } from "@/components/SourceDetails";
import { DataFailureState, LoadingState } from "@/components/States";
import { WarningsPanel } from "@/components/WarningsPanel";
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
import type { ActivityMode } from "@/lib/scoring/types";
import { deriveWeatherScene } from "@/lib/weather-scene/derive-weather-scene";

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

function onlyRainfallNowcastIsDegraded(payload: OutlookPayload): boolean {
  const degraded = payload.sources.filter(
    (source) => source.status !== "ok" || source.issues.length > 0,
  );
  return (
    degraded.length > 0 &&
    degraded.every((source) => source.id === "rainfallNowcast")
  );
}

export default function OutlookApp() {
  const [locationId, setLocationId] = useState<LocationId>(HONG_KONG_WIDE.id);
  const [locationStatus, setLocationStatus] = useState<LocationUiStatus>("locating");
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const shouldMoveFocus = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const [motionEnabled, setMotionEnabled] = useMotionPreference();
  const reducedMotion = usePrefersReducedMotion();

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
              ? "offline"
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
      setPickerOpen(true);
    });
  }, [loadOutlook]);

  useEffect(() => {
    loadOutlook(HONG_KONG_WIDE.id);
  }, [loadOutlook]);

  useEffect(() => {
    const handleOffline = () => {
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
    },
    [],
  );

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
    setPickerOpen(false);
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
  const weatherScene = useMemo(() => deriveWeatherScene(payload), [payload]);
  const onlyNowcastDegraded =
    payload?.status === "partial" &&
    onlyRainfallNowcastIsDegraded(payload);

  return (
    <>
    <WeatherScene
      key={viewStatus === "ready" ? "ready" : "safe"}
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

      <LocationControls
        locationLabel={payload?.location.label ?? locationLabel(locationId)}
        locationNote={locationNote}
        status={locationStatus}
        pickerOpen={pickerOpen}
        onTogglePicker={() => setPickerOpen((open) => !open)}
        updateLabel={
          latestUpdate
            ? `更新於 ${formatHktTime(latestUpdate)}`
            : viewStatus === "loading"
              ? "正在更新…"
              : viewStatus === "offline"
                ? "目前離線"
                : "資料暫不可用"
        }
      />

      <ModeTabs mode={mode} onChange={setMode} />

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

      {payload?.status === "partial" ? (
        <div className="partial-banner" role="status">
          <div>
            <strong>
              <span aria-hidden="true">!</span>{" "}
              {onlyNowcastDegraded
                ? "未能完整取得未來降雨預報"
                : "部分官方資料暫時不可用"}
            </strong>
            <p>
              {onlyNowcastDegraded
                ? "目前分數仍按已確認的即時觀測及警告計算。"
                : "只按可確認的觀測判斷風險；評分所需資料不足時會限制結論信心。"}
            </p>
          </div>
          <button className="text-button" type="button" onClick={retry}>重試資料</button>
        </div>
      ) : null}

      {payload && result ? (
        <div className="decision-layout">
          <ResultHero result={result} mode={mode} />
          <DataCards
            weather={payload.weather}
            aqhi={payload.aqhi}
            rainfallNowcast={payload.rainfallNowcast}
            location={payload.location}
            generatedAt={payload.generatedAt}
          />
        </div>
      ) : null}

      {pickerOpen ? (
        <DistrictPicker locationId={locationId} onSelect={selectLocation} />
      ) : null}

      {payload && result ? (
        <div className="support-layout">
          <WarningsPanel warnings={payload.warnings} forecast={payload.forecast} weather={payload.weather} />
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
