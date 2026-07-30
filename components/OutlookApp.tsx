"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DataCards } from "@/components/DataCards";
import {
  DistrictPicker,
  LocationControls,
  type LocationUiStatus,
} from "@/components/LocationControls";
import { ModeTabs } from "@/components/ModeTabs";
import { ResultHero } from "@/components/ResultHero";
import { SourceDetails } from "@/components/SourceDetails";
import { CompleteFailure, LoadingState } from "@/components/States";
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

interface RouteResponseState {
  key: string;
  payload: OutlookPayload | null;
  failed: boolean;
}

function locationLabel(locationId: LocationId): string {
  return locationId === HONG_KONG_WIDE.id
    ? HONG_KONG_WIDE.nameTc
    : (getDistrictById(locationId)?.nameTc ?? HONG_KONG_WIDE.nameTc);
}

function latestPublishedAt(payload: OutlookPayload): string | null {
  return payload.sources.reduce<string | null>((latest, source) => {
    if (!source.publishedAt) return latest;
    if (!latest) return source.publishedAt;
    return Date.parse(source.publishedAt) > Date.parse(latest) ? source.publishedAt : latest;
  }, null);
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
  const [retryToken, setRetryToken] = useState(0);
  const [routeResponse, setRouteResponse] = useState<RouteResponseState>({
    key: "",
    payload: null,
    failed: false,
  });
  const locationRequested = useRef(false);
  const manualSelection = useRef(false);
  const shouldMoveFocus = useRef(false);
  const [motionEnabled, setMotionEnabled] = useMotionPreference();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (locationRequested.current) return;
    locationRequested.current = true;

    void requestDistrictFromGeolocation().then((result) => {
      if (manualSelection.current) return;

      if (result.status === "success") {
        // getNearestDistrict only returns entries from the canonical DISTRICTS list.
        setLocationId(result.district.id as LocationId);
        setLocationStatus("located");
        return;
      }

      setLocationId(HONG_KONG_WIDE.id);
      setLocationStatus(result.status);
      setPickerOpen(true);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const key = `${locationId}:${retryToken}`;

    void fetchOutlookRoute(locationId, { signal: controller.signal }).then(
      (response) => {
        if (!current || (!response.ok && response.error.type === "aborted")) {
          return;
        }

        setRouteResponse(
          response.ok
            ? { key, payload: response.payload, failed: false }
            : { key, payload: null, failed: true },
        );
      },
    );

    return () => {
      current = false;
      controller.abort();
    };
  }, [locationId, retryToken]);

  const requestKey = `${locationId}:${retryToken}`;
  const loading = routeResponse.key !== requestKey;
  const payload = loading ? null : routeResponse.payload;
  const requestFailed = !loading && routeResponse.failed;

  const result = useMemo(() => {
    if (!payload || payload.status === "error") return null;
    return scoreOutlook(toScoringInput(payload), mode);
  }, [mode, payload]);

  useEffect(() => {
    if (loading || !shouldMoveFocus.current) return;

    const target = document.getElementById(
      result ? "result-title" : "complete-failure-title",
    );
    target?.focus();
    shouldMoveFocus.current = false;
  }, [loading, requestFailed, result]);

  const selectLocation = (nextLocationId: LocationId) => {
    manualSelection.current = true;
    shouldMoveFocus.current = true;
    setLocationId(nextLocationId);
    setLocationStatus("manual");
    setPickerOpen(false);
  };

  const retry = () => {
    shouldMoveFocus.current = true;
    setRetryToken((token) => token + 1);
  };
  const completeFailure = requestFailed || payload?.status === "error";
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
      scene={weatherScene}
      motionEnabled={motionEnabled}
      reducedMotion={reducedMotion}
    />
    <a className="skip-link" href="#main-content">跳至主要內容</a>
    <main
      className="app-shell"
      id="main-content"
      tabIndex={-1}
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
        updateLabel={latestUpdate ? `更新於 ${formatHktTime(latestUpdate)}` : loading ? "正在更新…" : "等待資料"}
      />

      <ModeTabs mode={mode} onChange={setMode} />

      {loading ? <LoadingState /> : null}

      {!loading && completeFailure ? <CompleteFailure onRetry={retry} /> : null}

      {!loading && payload && payload.status === "partial" ? (
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

      {!loading && payload && payload.status !== "error" && result ? (
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

      {!loading && payload && payload.status !== "error" && result ? (
        <div className="support-layout">
          <WarningsPanel warnings={payload.warnings} forecast={payload.forecast} weather={payload.weather} />
          <SourceDetails sources={payload.sources} />
        </div>
      ) : null}

      {!loading && payload?.status === "error" ? <SourceDetails sources={payload.sources} /> : null}

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
