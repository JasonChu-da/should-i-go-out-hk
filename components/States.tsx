import Link from "next/link";
import { formatHktDateTime } from "@/lib/presentation/format";

export function LoadingState() {
  return (
    <section className="loading-state" aria-live="polite" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <div className="loading-copy">
        <h2>正在整理最新官方資料…</h2>
        <p>天氣、雨量、紫外線、警告和空氣質素會分開核對。</p>
        <p className="loading-timeout-hint">
          載入時間比預期長。<Link href="/">重新載入整頁</Link>
        </p>
      </div>
    </section>
  );
}

interface CompleteFailureProps {
  onRetry: () => void;
}

interface DataFailureStateProps extends CompleteFailureProps {
  kind: "offline" | "unavailable";
  lastPublicUpdate?: string | null;
}

export function DataFailureState({
  kind,
  lastPublicUpdate = null,
  onRetry,
}: DataFailureStateProps) {
  const offline = kind === "offline";

  return (
    <section className="complete-failure" data-state={kind} role="alert">
      <span className="failure-symbol" aria-hidden="true">!</span>
      <p className="eyebrow">
        {offline ? "目前離線" : "暫時沒有可用的最新官方資料"}
      </p>
      <h2 id="complete-failure-title" tabIndex={-1}>
        {offline ? "無法取得即時天氣" : "暫時無法取得天氣資料"}
      </h2>
      <p>
        {offline
          ? "網絡中斷期間不會顯示舊天氣或分數。重新連線後會自動取得最新資料，你亦可手動重試。"
          : "天氣服務可能暫時無法回應、格式異常或已過時；我們不會用舊資料或預設數字代替。"}
      </p>
      {lastPublicUpdate ? (
        <p className="last-public-update">
          最新官方資料時間：{formatHktDateTime(lastPublicUpdate)}
        </p>
      ) : null}
      <div className="failure-actions">
        <button className="primary-button" type="button" onClick={onRetry}>
          {offline ? "重新嘗試" : "重新載入資料"}
        </button>
        <a className="secondary-button" href="https://www.hko.gov.hk/tc/index.html" target="_blank" rel="noreferrer">前往香港天文台<span className="sr-only">（在新分頁開啟）</span></a>
      </div>
    </section>
  );
}

export function CompleteFailure({ onRetry }: CompleteFailureProps) {
  return <DataFailureState kind="unavailable" onRetry={onRetry} />;
}
