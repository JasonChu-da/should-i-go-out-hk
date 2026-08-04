# 「暫時無法取得天氣資料」診斷報告（2026-08-04）

## 結論

本輪未能重現問題，因此沒有修改程式碼、補測試或建立 commit。development、production 及正式部署 API 的所有實測回應均為 HTTP 200、頂層 `status: "ok"`，五個來源全部為 `ok`，沒有 issues 或錯誤 code／category。

目前不能判定根本原因。最值得優先驗證的部署差異是：正式 API 的 10 次回應均帶有 `x-vercel-id: hnd1::iad1::...`，顯示 Function 在 `iad1` 執行，而 README 建議設為香港 `hkg1`。跨區執行可合理解釋較高延遲，但本輪沒有 timeout 或網絡錯誤，所以不能把它當成已證實根因。

## Git 與部署版本

- 本機 branch：`codex/audit-hardening-20260804`
- 本機 HEAD：`b07df59aed3c990be83b350b63fa2d633a2f5793`（`fix: harden warning visibility and offline state handling`）
- 上一批 audit 修正已是獨立 commit；該 commit 包含 7 個檔案，沒有混入本輪診斷改動。
- 診斷開始時已存在、且本輪沒有碰觸的 working-tree 內容：
  - `M PLANS.md`
  - `?? docs/SCORING_MECHANISM_REPORT.md`
- GitHub Deployments API 顯示目前 Production deployment commit 為 `6575932809a533f758306767dafcafe3abaa9626`，即 `main`／`origin/main`。
- 正式部署不包含本機 `b07df59`。尤其是它仍會把任何 browser route `network` rejection 直接顯示為 `offline`；本機新版才會同時檢查 `navigator.onLine`，在線時顯示 `unavailable`。

## README 核對

README 已包含：

- `npm run dev` 本機啟動方式及 `http://localhost:3000`。
- `/api/outlook?location=hong-kong` 的直接診斷方法。
- `npm run build` 後以 `npm run start` 啟動 production。
- 受限 sandbox 可能阻擋 Node.js 出站，應用一般 PowerShell／Terminal 重試。
- 五來源各自 8 秒 timeout、browser route 12 秒 deadline、process-memory cache、Vercel Runtime Logs 位置。
- `/api/` 採 network-only，不會由 service worker 回傳舊天氣 payload。

## 實測方法

- 位置：`hong-kong`
- 路徑：`/api/outlook?location=hong-kong`
- 本機 server 均在一般 PowerShell 權限下啟動，避免 sandbox 網絡限制。
- 每次 response 都完整解碼為 JSON，再讀取頂層 `status`、五個 `sources[].status` 及 `sources[].issues`。
- production 先執行 `npm run build`，再啟動 `next start`。
- development 與 production 使用不同 port 並分開啟停，避免共用 `.next` 時互相干擾。

## 本機 development 結果

| 嘗試 | HTTP | 頂層 status | 時間 |
| --- | ---: | --- | ---: |
| 1（首次編譯／冷請求） | 200 | `ok` | 1654 ms |
| 2 | 200 | `ok` | 17 ms |
| 3 | 200 | `ok` | 14 ms |
| 4 | 200 | `ok` | 15 ms |
| 5 | 200 | `ok` | 15 ms |

server stderr 為空。首次 server log 顯示 application code 約 1334 ms，其後因同 process cache 約 4–5 ms。

## 本機 production 結果

| 嘗試 | HTTP | 頂層 status | 時間 |
| --- | ---: | --- | ---: |
| 1（冷請求） | 200 | `ok` | 2192 ms |
| 2–5（暖請求） | 200 | `ok` | 約 11–12 ms |

server stderr 為空。

## 正式部署 API 結果

- 正式網域：`https://should-i-go-out-hk.vercel.app`
- Production deployment：`6575932`，2026-08-03 16:22（香港時間）完成。

| 嘗試 | HTTP | 頂層 status | 時間 | `x-vercel-cache` |
| --- | ---: | --- | ---: | --- |
| 1 | 200 | `ok` | 3632 ms | `MISS` |
| 2 | 200 | `ok` | 536 ms | `MISS` |
| 3 | 200 | `ok` | 327 ms | `MISS` |
| 4 | 200 | `ok` | 320 ms | `MISS` |
| 5 | 200 | `ok` | 542 ms | `MISS` |
| 6 | 200 | `ok` | 308 ms | `MISS` |
| 7 | 200 | `ok` | 306 ms | `MISS` |
| 8 | 200 | `ok` | 304 ms | `MISS` |
| 9 | 200 | `ok` | 496 ms | `MISS` |
| 10 | 200 | `ok` | 308 ms | `MISS` |

10 次 `x-vercel-id` 均為 `hnd1::iad1::...`。依 Vercel 文件，此 header 同時列出請求經過的 region 與 Function execution region；本輪觀測與 README 建議的 `hkg1` 不一致。

## 五個來源狀態

三種環境的所有實測均相同：

| 來源 id | 資料來源 | status | issues | 錯誤 code／category |
| --- | --- | --- | --- | --- |
| `weather` | 香港天文台即時天氣 | `ok` | 無 | 無錯誤 |
| `warnings` | 香港天文台天氣警告 | `ok` | 無 | 無錯誤 |
| `forecast` | 香港天文台本港預報 | `ok` | 無 | 無錯誤 |
| `aqhi` | 環境保護署 AQHI | `ok` | 無 | 無錯誤 |
| `rainfallNowcast` | 香港天文台降雨臨近預報 ZIP | `ok` | 無 | 無錯誤 |

## 現有錯誤分類

### Browser 到 `/api/outlook`

`lib/outlook/browser-client.ts` 分為：

- `aborted`：React cleanup／較新請求取消舊請求。
- `timeout`：整個 route request 或 JSON body 超過 12 秒。
- `http`：內部 route 非 2xx，保留 HTTP status。
- `invalid`：response JSON 無法解析或 payload contract 不符。
- `network`：fetch rejection，包括 browser 到 server／proxy 的網絡錯誤。

本機 `b07df59` 的 UI 規則：

- 真正 browser offline event：`offline`，並取消及失效化未完成請求。
- `network` 且 `navigator.onLine === false`：`offline`。
- `network` 且 `navigator.onLine === true`：`unavailable`，不得因 `fetch failed` 直接當成 offline。
- `timeout`／`http`／`invalid`：`unavailable`。
- payload 頂層 `error`（四個核心來源全部不可用）：`unavailable`。
- payload 頂層 `partial`：仍 render 可用資料並顯示部分資料提示。
- payload 頂層 `ok`：完整 ready 狀態。

正式部署 `6575932` 尚未包含上述 `navigator.onLine` 判斷，仍把所有 browser route `network` rejection 當成 offline。

### Server 到政府來源

一般 JSON client 的內部分類：`timeout`、`network`、`http`、`content-type`、`too-large`、`invalid-json`。

降雨 ZIP client 的內部分類：`timeout`、`network`、`http`、`content-type`、`body`、`too-large`、`invalid-data`。

目前 `/api/outlook` payload 只把錯誤轉成繁中 `sources[].issues` 字串，沒有輸出結構化 code／category；server 亦沒有為這些已處理 failure 寫 runtime log。因此若事後只有畫面截圖，無法區分 DNS、connection reset、上游非 200、timeout 或 ZIP 解析失敗。

## 已排除與未排除

### 本輪證據可排除

- 目前 commit 無法 production build。
- 一般本機環境完全不能連出 HKO／AQHI。
- 本輪測試時五來源的 schema／freshness 全部失敗。
- `/api/outlook` 永久 pending 或超過 browser 12 秒 deadline。
- 本輪 10 次正式請求期間的持續性部署故障。
- service worker 以舊 payload 回應 `/api/`；設計與現有 PWA 測試均為 network-only。

### 尚未排除

- 偶發 DNS lookup 錯誤。
- 偶發 connection reset／TLS／proxy network error。
- 任一政府來源超過 8 秒 timeout。
- 政府來源偶發非 200、錯誤 Content-Type、截斷／無效 JSON。
- 降雨 ZIP 偶發下載中斷、超限、內容或 CSV 解析錯誤。
- Vercel Function duration／平台中斷。
- browser 到 Vercel 的 route request 超過 12 秒；正式冷請求本輪已達 3.63 秒，但仍低於 deadline。
- `iad1` 跨區執行是否提高上述事件的發生率。
- 問題發生時使用者實際看到的是 current deployed commit 的 offline 誤分類，或 payload 頂層 `error` 導致的 unavailable。

## Runtime logs 權限

本環境未安裝／連結 Vercel CLI，in-app browser 未登入 Vercel，Chrome connector 不可用。因此無法讀取錯誤期間的 Vercel Runtime Logs，也不能用 logs 排除 DNS、reset、timeout、`fetch failed`、Function duration、上游非 200 或 ZIP 錯誤。

## 下次出現問題時必須保留的 log 欄位

最小足夠欄位：

- `requestId`：優先保存 response 的 `x-vercel-id`，畫面亦應可複製。
- deployment commit SHA、deployment URL、environment、Function region。
- route 開始／結束時間、總 duration、location id、頂層 status、HTTP status。
- 每個 source 的 id、endpoint host、開始／結束時間、duration、成功／失敗。
- 結構化 error category 及 code；保留 `error.name`、`error.code`、`cause.name`、`cause.code`，但不記錄 response body 或敏感 header。
- 上游 HTTP status、Content-Type、Content-Length、實際下載 bytes。
- timeout 階段：DNS／connect／headers／body／ZIP inflate／CSV parse／runtime validation。
- cache：hit／miss、cache age、是否 stale fallback。
- ZIP：compressed bytes、uncompressed bytes、entry name、CSV row count、parser fatal issue code。
- browser：`navigator.onLine`、route error type、route HTTP status、12 秒 deadline 是否觸發。

## 最具體下一步

1. 先把 Vercel Function region 設為 `hkg1` 並 redeploy，再用 `x-vercel-id` 驗證 execution region；同時確認新 deployment 包含至少 `b07df59`。
2. 下一次事件發生時，立即保存發生時間（香港時間）、完整 `/api/outlook` JSON、HTTP status、response headers 中的 `x-vercel-id`，並匯出同一時段 Runtime Logs。
3. 若問題再次出現而現有 logs 仍沒有結構化上游失敗資訊，再做一個獨立 observability commit：只增加上述最小 server-side 結構化 log 與 request correlation，不改 scoring、cache 或重試策略。

