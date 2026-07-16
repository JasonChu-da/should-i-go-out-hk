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
import type { OutlookPayload } from "@/lib/domain/outlook";
import {
  getDistrictById,
  HONG_KONG_WIDE,
  type LocationId,
} from "@/lib/location/districts";
import { requestDistrictFromGeolocation } from "@/lib/location/geolocation";
import { fetchOutlookRoute } from "@/lib/outlook/browser-client";
import { toScoringInput } from "@/lib/outlook/scoring-input";
import { formatHktDateTime } from "@/lib/presentation/format";
import { scoreOutlook } from "@/lib/scoring/score";
import type { ActivityMode } from "@/lib/scoring/types";

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
      ? "非地區化結果；雨量及 AQHI 採用全港有效資料中的保守代表值。"
      : "按地區雨量及官方代表監測站評估。");

  return (
    <main className="app-shell">
      <header className="site-header">
        <div>
          <p className="brand-kicker">香港即時外出指引</p>
          <h1>香港現在適合出門嗎？</h1>
        </div>
        <p className="header-update" aria-live="polite">
          <span aria-hidden="true">↻</span>{" "}
          {latestUpdate ? `最新資料 ${formatHktDateTime(latestUpdate)}` : loading ? "正在更新資料" : "等待可用資料"}
        </p>
      </header>

      <LocationControls
        locationLabel={payload?.location.label ?? locationLabel(locationId)}
        locationNote={locationNote}
        status={locationStatus}
        pickerOpen={pickerOpen}
        onTogglePicker={() => setPickerOpen((open) => !open)}
      />

      <ModeTabs mode={mode} onChange={setMode} />

      {loading ? <LoadingState /> : null}

      {!loading && completeFailure ? <CompleteFailure onRetry={retry} /> : null}

      {!loading && payload && payload.status === "partial" ? (
        <div className="partial-banner" role="status">
          <div>
            <strong><span aria-hidden="true">!</span> 部分官方資料暫時不可用</strong>
            <p>只按可確認的觀測判斷風險；資料不足會限制結論信心。</p>
          </div>
          <button className="text-button" type="button" onClick={retry}>重試資料</button>
        </div>
      ) : null}

      {!loading && payload && payload.status !== "error" && result ? (
        <ResultHero
          result={result}
          mode={mode}
          dataLimited={payload.status === "partial"}
        />
      ) : null}

      {pickerOpen ? (
        <DistrictPicker locationId={locationId} onSelect={selectLocation} />
      ) : null}

      {!loading && payload && payload.status !== "error" && result ? (
        <>
          <DataCards weather={payload.weather} aqhi={payload.aqhi} />
          <WarningsPanel warnings={payload.warnings} forecast={payload.forecast} weather={payload.weather} />
          <SourceDetails sources={payload.sources} />
        </>
      ) : null}

      {!loading && payload?.status === "error" ? <SourceDetails sources={payload.sources} /> : null}

      <footer className="site-footer">
        <p><strong>資料限制：</strong>地區雨量是過去一小時紀錄，不是未來兩小時預報；濕度及紫外線亦不一定代表你所在位置。</p>
        <p>本網站只提供一般資訊，不是專業氣象、醫療或緊急安全建議。惡劣天氣時請以香港天文台及政府指示為準。</p>
        <div className="footer-links">
          <a href="https://www.hko.gov.hk/tc/index.html" target="_blank" rel="noreferrer">香港天文台<span className="sr-only">（在新分頁開啟）</span></a>
          <a href="https://www.aqhi.gov.hk/tc.html" target="_blank" rel="noreferrer">空氣質素健康指數<span className="sr-only">（在新分頁開啟）</span></a>
        </div>
      </footer>
    </main>
  );
}
