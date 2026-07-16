# MVP 驗收與 QA 紀錄

驗收日期：2026-07-14（HKT）

## 實際政府 API 探測

2026-07-14 20:02–20:17 HKT 以真實 HTTP GET 探測四個官方來源：HKO `rhrread`、`warnsum`、`flw` 及環保署 AQHI 均為 HTTP 200、JSON。狀態碼、Content-Type、根結構、必要／可選／缺失欄位及來源時間已記錄於 [`API_OBSERVATIONS.md`](API_OBSERVATIONS.md)。

21:20 HKT 再次查詢 HKO `rhrread` 核對全部雨量地名及氣溫站；現時回傳「深水埗」，而保存的同日實測 fixture 回傳「深水埗區」，因此實作使用可測試的尾隨「區」別名比對，不猜定單一固定字串。

## Production server 端到端 smoke test

執行 production build 後，以 `npm run start -- -p 3001` 啟動正式 server，再經本機 HTTP 呼叫真實官方來源：

- 首頁：HTTP 200；SSR HTML 有 `lang="zh-Hant-HK"`、產品名稱及可理解的 loading 狀態。
- `hong-kong` 與十八個 canonical district id：19／19 全部 HTTP 200。
- 每個有效位置：回傳 id 與請求相同、`payload.status = ok`、四個來源 metadata 齊全。
- 無效 `location=not-a-district`：HTTP 400，不執行聚合。
- response 使用 `no-store`；API route 有 `X-Content-Type-Options: nosniff`。

## 自動測試

最終測試涵蓋：

- normal weather、light／heavy rainfall、very hot、high humidity、high UV、high AQHI。
- 所有集中定義的 warning code × 三個活動模式；黑雨、八號或以上及海嘯最高 1 分。
- 警告 API unavailable、不完整 warning item、unknown warning、cancelled／expired warning。
- stale AQHI、missing temperature、malformed root／item／timestamp／數值、future timestamp。
- one／all API unavailable、partial／complete failure semantics。
- 十八區 mapping、深水埗地名 alias、全港保守聚合、AQHI 路邊站排除及繁中站名。
- geolocation denied／timeout／unsupported／境外座標；精確座標不會從 wrapper 回傳。
- API client timeout、HTTP、Content-Type、invalid JSON、cache、concurrent dedupe 及失敗不 cache。
- `/api/outlook` default、十八區、invalid route 及 headers。
- 內部 browser payload runtime boundary、12 秒 end-to-end deadline、cleanup／非 cleanup abort、永久 pending fetch／JSON body、初始 UI、三模式、十八區 picker、loading／failure／retry 語意。

結果：15 個 test files、259 項測試全部通過。測試只用本地 fixture 或 mocked fetcher，沒有 live government API dependency。

## Accessibility 與 responsive 檢查

- `html` 使用 `zh-Hant-HK`；viewport 使用 device width。
- 主要 button 最少 44px；source／footer links 亦有 44px hit area。
- 模式與地區選擇使用 button、`aria-pressed`、`aria-expanded`、`aria-controls`。
- 模式切換後以 polite live region 宣讀模式、分數、結論及摘要。
- 地區選擇或 retry 完成後，把焦點移到新結果或失敗標題；所有 focus indicator 有明顯 outline。
- loading 有 `aria-busy`；partial／warning／complete failure 有文字與符號，不只靠顏色。
- SSR loading 卡在 14 秒後以純 CSS 顯示整頁重載連結；即使 client JavaScript 未接管，使用者仍有可操作出口。
- 系統 dark mode 與 reduced-motion 均有 CSS；reduced-motion 下 spinner 不再旋轉。
- 360px 採單欄結果及資料卡，桌面依序為 2／4 欄；沒有固定內容寬度或橫向資料表。
- 拒絕定位時先顯示香港整體結果，十八區清單排在 result hero 之後，避免把首屏結論推走。
- 對比度重點複核：淺色 focus 5.88:1、深色 focus 9.90:1、淺色 stale badge 8.22:1、深色 stale／prepare 9.50:1。
- 靜態 SSR component tests 確認沒有地址／長文字 input，並核對全部 19 個 location buttons。

2026-07-14 當次限制：in-app Browser runtime 初始化失敗；其後 Windows 視覺控制亦因無法可靠確認 Chrome URL 而由安全機制停止。因此該次沒有產生 360px／desktop 自動截圖比較，responsive 驗收依據為 SSR component tests、CSS breakpoint／overflow 稽核及上述結構檢查。此限制已由下方 2026-07-16 的瀏覽器實測補足。

## 22:04 HKT 載入狀態修正 smoke test

- 識別出 port 3000 原本是舊 production build；其 static HTML 與 client chunks 不含最新原始碼，先停止後重新 build／start。
- 新 production 首頁 HTTP 200，SSR HTML 已包含 `loading-timeout-hint` 後備。
- 真實 `/api/outlook?location=hong-kong` 於約 2.17 秒回傳 `status = ok`；weather、warnings、forecast、AQHI 四個來源均為 `ok`。
- 即時量度中氣溫、雨量與 AQHI 為 fresh；夜間 UV 正確標為 `notApplicable`，沒有虛構數值。

## 最終命令結果

| 命令 | 結果 |
| --- | --- |
| `npm run lint` | 通過，0 error |
| `npm run typecheck` | 通過 |
| `npm test` | 15 files、259 tests 通過 |
| `npm run build` | 通過；首頁 static，`/api/outlook` dynamic |
| `npm run start -- -p 3001` | production server 成功啟動並完成上述 smoke test |

## 2026-07-16 驗收及修復複核

### 品質指令

依指定次序重新執行：

| 命令 | 實際結果 |
| --- | --- |
| `npm run lint` | 通過；ESLint 0 error |
| `npm test` | 通過；15 test files、259 tests passed |
| `npm run build` | 通過；Next.js 16.2.10 production build，`/` static、`/api/outlook` dynamic |
| `npm run typecheck` | 通過；route types generated，`tsc --noEmit` 0 error |

### 真實政府 API 與 production route

2026-07-16 約 13:02–13:11 HKT 以真實 HTTPS GET 重新探測四個官方來源，全部 JSON 均成功下載及解析：

- HKO `rhrread`：object；`updateTime = 2026-07-16T13:02:00+08:00`。
- HKO `warnsum`：object；當時有動態鍵 `WTS`。
- HKO `flw`：object；`updateTime = 2026-07-16T12:45:00+08:00`。
- 環保署 AQHI：18-item array；欄位為 `station`、`aqhi`、`health_risk`、`publish_date`，首項發布時間為 `2026-07-16T12:30:00`。

以具外網權限的 production server 啟動網站後，`GET /api/outlook?location=hong-kong` 回傳 `status = ok`，weather、warnings、forecast、AQHI 四來源均為 `ok`。當次正規化結果包括氣溫 26°C、十八區最高過去一小時雨量 21 mm、UV 2、AQHI 3 及一項生效警告。runtime route 直接使用 `lib/api/endpoints.ts` 的官方 URL；fixture 只在測試依賴注入路徑使用。

### 失敗、缺失及過時資料

- 以無外網 production server 實測四來源全失敗：browser loading 最終收斂至「現在未能可靠評分」，不顯示分數，提供「重新載入資料」及「前往香港天文台」；四個來源逐一顯示暫時不可用。重試後再次收斂並更新擷取時間。
- 自動測試確認單一 API unavailable 仍保留其他資料；warning unavailable 把分數限制至最高 7，malformed warning snapshot 限制至最高 3。
- stale AQHI／weather／forecast／warning snapshot 保留發布時間及 stale 狀態，但 `toScoringInput` 只把 `fresh` metric 傳入計分；missing、malformed、future timestamp 亦不會補造成 0 或安全值。
- API client 測試覆蓋 timeout、network、non-2xx、錯誤 Content-Type、invalid JSON、失敗不 cache；browser route client另有 12 秒整體 deadline。

### 位置私隱與 fallback

runtime 原始碼沒有 localStorage、sessionStorage、IndexedDB、database 或 analytics。精確 latitude／longitude 只在 `requestDistrictFromGeolocation` success callback 內傳給本地 `getNearestDistrict`，回傳值只含 canonical district record；browser request 及 server route 只傳 location id。

拒絕定位的單元測試確認只呼叫一次 `getCurrentPosition` 並回傳 `{ status: "denied" }`；`OutlookApp` 隨即保留香港整體、打開十八區 picker，且不再要求權限。受控瀏覽器無法操作 browser chrome 的 permission prompt，因此實際瀏覽器以 geolocation timeout 走同一 fallback UI 路徑；已實際選擇「中西區」、確認地區氣溫／雨量／AQHI 站改變，再一按切回香港整體。

### Responsive、互動與 accessibility

- 360 × 800 viewport：document client／scroll width 同為 345 px，沒有水平 overflow；最小 button 高度 44 px，沒有任何按鈕寬或高少於 44 px。
- 首屏中 header bottom 108 px、模式列 bottom 317 px、結果卡 bottom 623 px、建議 bottom 536 px；在 800 px 高度內完整看見產品名、更新時間、三模式、分數、結論、摘要及建議。
- 1280 × 720 viewport：document client／scroll width 同為 1265 px；四張資料卡同列，每張約 280 px。
- 實際點選一般外出、跑步／踩單車及晾衫後，`aria-pressed` 與分數／原因同步更新；選區完成後焦點移至新結論。
- 瀏覽器 console 沒有 error 或 warning。dark mode 及 reduced-motion 由 CSS media query 與既有靜態測試確認。

### 複核結論

本輪沒有發現需要修改產品程式碼的規格內缺口。除更新 `PLANS.md` 及本 QA 紀錄外，沒有修改 runtime、測試或依賴，也沒有建立 Git commit。
