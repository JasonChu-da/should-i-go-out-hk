import Link from "next/link";

export function LoadingState() {
  return (
    <section className="loading-state" aria-live="polite" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <div className="loading-copy">
        <h2>正在整理最新官方資料</h2>
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

export function CompleteFailure({ onRetry }: CompleteFailureProps) {
  return (
    <section className="complete-failure" role="alert">
      <span className="failure-symbol" aria-hidden="true">!</span>
      <p className="eyebrow">暫時沒有可用的最新官方資料</p>
      <h2 id="complete-failure-title" tabIndex={-1}>現在未能可靠評分</h2>
      <p>資料可能無法連線、格式異常或已過時；我們不會用舊資料或預設數字代替。你可以重試，或直接查看香港天文台。</p>
      <div className="failure-actions">
        <button className="primary-button" type="button" onClick={onRetry}>重新載入資料</button>
        <a className="secondary-button" href="https://www.hko.gov.hk/tc/index.html" target="_blank" rel="noreferrer">前往香港天文台<span className="sr-only">（在新分頁開啟）</span></a>
      </div>
    </section>
  );
}
