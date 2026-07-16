"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Avoid exposing payload contents or precise location. The framework's
    // opaque digest is sufficient for local diagnostics.
    if (error.digest) console.error(`頁面錯誤代碼：${error.digest}`);
  }, [error.digest]);

  return (
    <main className="app-shell">
      <section className="complete-failure" role="alert">
        <span className="failure-symbol" aria-hidden="true">!</span>
        <p className="eyebrow">頁面暫時無法顯示</p>
        <h1>未能完成這次評估</h1>
        <p>沒有資料會被猜測或補上。你可以重新嘗試載入頁面，或直接查看香港天文台。</p>
        <div className="failure-actions">
          <button className="primary-button" type="button" onClick={reset}>重新嘗試</button>
          <a className="secondary-button" href="https://www.hko.gov.hk/tc/index.html" target="_blank" rel="noreferrer">
            前往香港天文台<span className="sr-only">（在新分頁開啟）</span>
          </a>
        </div>
      </section>
    </main>
  );
}
