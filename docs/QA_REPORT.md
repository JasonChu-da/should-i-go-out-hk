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

## 2026-07-16：WeatherScene 沉浸式動態背景驗收

### 資料與決策邊界

- 以真實 HTTP 請求重新確認 HKO `rhrread`、`warnsum`、`flw` 及環保署 AQHI 均為 HTTP 200 JSON；WeatherScene 只使用既有 normalized outlook 內的天氣圖示、所選地區過去一小時雨量、警告快照、資料時間及香港時間。
- `deriveWeatherScene` 為純函數；嚴重警告優先於一般圖示。天氣圖示、雨量或警告快照缺失、失敗、不完整或過時時一律回傳 `neutral`、`animationEnabled: false`，不猜測現在天氣。
- 日夜門檻固定記錄為香港時間 07:00–17:59 為日間，其餘為夜間；只影響視覺，不進入 scoring input。

### 實際瀏覽器驗收

以只限 development 的 `/scene-preview` 驗收 `clear`、`cloudy`、`overcast`、`rain`、`heavy-rain`、`storm`、`hot`、`neutral` 及 day／night。Production server 實測首頁 HTTP 200、`/scene-preview` HTTP 404。

| Viewport | 驗收結果 |
| --- | --- |
| 360 × 800 | 無水平 overflow；所有按鈕最少 44px；首屏看見地區、分數、結論、三項主要建議及三個模式；三項建議底部為 419px、結果區底部為 487px。 |
| 390 × 844 | 無水平 overflow；模式欄、Hero 及建議保持完整資訊層級。 |
| 768 × 1024 | 無水平 overflow；決策內容單欄、資料卡兩欄，觸控目標符合要求。 |
| 1440 × 900 | 無水平 overflow；主決策與輔助資料形成 2 欄層級，來源資訊可見。 |

瀏覽器 console 為 0 error／warning。背景視覺層全部 `pointer-events: none`，不阻擋捲動、按鈕、連結或鍵盤操作。focus ring、hover state、安全區 padding 及可點擊目標均已覆核。

### Motion、對比與效能

- 透過瀏覽器模擬 `prefers-reduced-motion: reduce`：雨滴、雲層、霧氣及天空亮度動畫全部停止，但保留靜態天氣語意；控制顯示「動態背景：已減少」。
- 手動關閉動態背景後，版本化設定保存在 localStorage，重新載入後仍為關閉；head inline script 在 hydration 前設定 HTML data attribute，避免錯誤動態狀態閃現。
- 保守取樣的明亮天空 header 合成色上，白色標題對比為 5.77:1、kicker 為 5.07:1；主要內容 surface 上正文為 9.58:1、次要文字為 6.90:1、focus 色為 8.61:1。
- RainCanvas 使用單一 Canvas、`requestAnimationFrame`、DPR 上限 1.75、依 viewport／硬件能力調低粒子數；頁面 hidden、非雨景或 unmount 時停止及清理 loop。主要 CSS 動畫只改變 `transform` 與 `opacity`。
- Scene crossfade 只改變 opacity，視覺 key 排除時間及 reason；相同 scene／period／雨勢／severity 更新不會重建背景動畫。
- 沒有新增圖片或二進制素材，沒有新增 dependency；背景使用 CSS gradient、原創 inline SVG 與 Canvas。

### 自動測試及 production build

| 命令 | 真實結果 |
| --- | --- |
| `npm run lint` | 通過；ESLint 0 error。 |
| `npm test` | 通過；16 test files、278 tests passed。 |
| `npm run build` | 通過；Next.js 16.2.10 production build 完成。 |
| `npm run start -- -p 3101` | 啟動成功；`/` 為 200，`/scene-preview` 為 404。 |

已知限制：日夜第一版使用固定本地時間門檻，未計算每天日出日落；HKO 若加入未知 icon 或 warning code，場景會保守降級至 neutral；低階裝置採用啟發式粒子降載，沒有長時間真機 GPU／電量 profiling。

## 2026-07-16：Harbour Sky 視覺系統及普通天氣動畫驗收

### 視覺與場景

- `app/globals.css` 已集中定義指定的 Harbour Sky 背景、surface、品牌、文字、邊框及三組狀態 tokens；品牌／按鈕／focus／一般資訊統一用藍色，綠色只保留資料正常與安全狀態。
- 晴朗日間含天空漸層、柔和日光、兩個景深的雲及低對比光暈；晴朗夜間含深藍至靛藍天空、16 顆固定星位、月光與城市天光。星層在 cloudy、overcast、rain、storm、hot、neutral 均為透明。
- 遠景雲實測 CSS 週期為 104／126／138 秒，近景為 64／78 秒；三個光暈為 26／32／38 秒。陰天霧氣及雷暴低亮度 pulse 只改變 transform／opacity。
- Hero 主卡維持藍色邊框與 surface，安全／警戒／危險只落在小型圖示、狀態 chip 及 score gauge；因素卡、模式選中底板及互動控制不再以綠色作品牌色。
- development preview 提供 `clear-day`、`clear-night`、`cloudy-day`、`cloudy-night`、`overcast`、`rain-light`、`rain-heavy`、`storm`、`neutral`、`reduced-motion`，另保留 `hot-day`；production smoke test 的 `/scene-preview` 為 HTTP 404。

### Responsive、reduced-motion 與效能

| Viewport | 實際結果 |
| --- | --- |
| 360 × 800 | 無水平 overflow；location bottom 129px、mode bottom 193px、Hero bottom 445px，地區、模式、分數、結論及首項建議都在首屏。 |
| 390 × 844 | 無水平 overflow；Hero bottom 442px，2×2 因素卡由 472px 開始。 |
| 768 × 1024 | 無水平 overflow；Hero 與 2×2 因素卡保持單欄決策層級。 |
| 1440 × 900 | 無水平 overflow；Hero 718px、因素區 418px，形成桌面雙欄。 |

- Chrome 模擬 `prefers-reduced-motion: reduce` 時，scene `data-motion` 變為 `off`；雲、光暈、霧氣、Hero 流光及分數動畫的 computed `animation-name` 均為 `none`，控制文字為「動態背景：已減少」。
- 手動關閉 motion toggle 時，HTML 與 scene 均轉為 `off`，雲、光暈及雷暴 pulse 停止；重新開啟後恢復。Canvas 仍只有一個元素，不建立 DOM 雨滴。
- Chrome DevTools 短時間取樣的 active storm 場景沒有新增 layout：桌面 development／HMR 活躍樣本 2 秒內 `LayoutCountDelta = 0`、`LayoutDuration = 0`，TaskDuration 約 216.55ms；穩定後的 390px 樣本 3 秒內 TaskDuration 約 5.02ms、ScriptDuration 0.31ms、RecalcStyleDuration 0.73ms、LayoutCountDelta 0。console 為 0 error／warning。

### 最終品質命令

| 命令 | 真實結果 |
| --- | --- |
| `npm run typecheck` | 通過；route types generated，TypeScript 0 error。 |
| `npm run lint` | 通過；ESLint 0 error。 |
| `npm test` | 通過；16 test files、280 tests passed。 |
| `npm run build` | 通過；Next.js 16.2.10 production build 完成。 |
| production smoke test | `/` 為 HTTP 200；`/scene-preview` 為 HTTP 404。 |

沒有新增 dependency。已知限制：日夜仍採固定香港時間門檻而非每日日出日落；Chrome 效能數據是短時間 development 取樣，未涵蓋長時間真機 GPU、耗電或所有 Android 裝置。

## 2026-07-16：第二版本完整驗收及規格內修復

### 相對上一個 commit 的範圍

Git diff 顯示第二版把原有首頁重整為 Harbour Sky 單頁決策介面，新增 inline SVG 圖示、真實天氣驅動的 WeatherScene、Canvas 雨景、日夜／天氣場景、動態偏好、development scene preview，以及天氣圖示 freshness metric 與 browser payload validation。README、PLANS、決策及 QA 文件同步補充架構、部署與視覺決策；沒有新增 production dependency、產品功能、帳戶、資料庫、分析或 API key。

### 真實政府資料與失敗路徑

約 21:35–21:40 HKT 直接 HTTPS GET 四個官方來源，全部為 HTTP 200、`application/json`：

- HKO `rhrread`：object，包含雨量、氣溫、濕度、圖示及夜間空 UV。
- HKO `warnsum`：object，當時含 `WTS` 雷暴警告。
- HKO `flw`：object，包含 `forecastDesc` 及 `updateTime`。
- 環保署 AQHI：17-item array，包含 `station`、`aqhi`、`health_risk`、`publish_date`。

具外網 production route `GET /api/outlook?location=hong-kong` 回傳 `status = ok`，weather／warnings／forecast／AQHI 四來源均為 `ok`；當時正規化為 27°C、最高雨量 0 mm、夜間 UV `notApplicable`、AQHI 3 及 WTS。runtime 搜尋只見 browser → `/api/outlook` → `buildOutlookPayload` → `fetchJson` → 官方 endpoint 的鏈路；fixture 只透過測試 dependency injection 使用。

另以無外網 production server 實測所有 API 失敗：12 秒內收斂至「現在未能可靠評分」，沒有外出分數，顯示重試、香港天文台出口、十八區 fallback 及「0 個資料來源可用」。單一 API failure、warning failure 最高 7、malformed warning 最高 3，則由 aggregate／scoring 自動測試確認。

### 指定情境結果

| 情境 | 驗收結果 |
| --- | --- |
| 正常天氣 | 三模式均 10 分、「適合出門」。 |
| 雷暴警告 | 單獨 WTS：一般 6、運動 3、晾衫 3；均先顯示遠離空曠地方、高地及水邊。當時 live 資料連同濕度及有雨預報為 6／1／0。 |
| 暴雨警告 | 黃雨為 6／4／3、紅雨為 3／2／1、黑雨三模式最高 1；所有已知 warning × 三模式均有回歸測試。 |
| 高溫 | 35°C：一般 5、運動 2、晾衫 10；運動模式扣分較重。 |
| 高 AQHI | AQHI 8：一般 7、運動 3、晾衫 10；不顯著影響晾衫。 |
| 夜間沒有 UV | normalization 標為 `notApplicable`，不顯示虛構值，也不觸發 missing-data cap。 |
| 部分 API 失敗 | 保留其他資料、顯示 partial banner／來源錯誤並限制信心。 |
| 所有 API 失敗 | 實際瀏覽器不顯示分數，提供重試及官方出口。 |
| 資料過時 | stale 值保留時間與狀態供顯示，但不進入扣分；相關資料不足時最高 7。 |
| 定位被拒絕 | wrapper 只請求一次並回傳 `denied`；UI 顯示香港整體及 18 區一按 fallback，不傳送或保存精確座標。瀏覽器實測 timeout 走相同 fallback 路徑。 |

### 動態、responsive、accessibility 及效能

- 修正前手動關閉仍有 Hero 10 秒流光、分數 0.52 秒進場及模式列 0.22 秒 transition。修正後 scene、Canvas、Hero、score、mode indicator、panel 及控制 transition 全部停止；14 秒重載提示以零時長 delayed reveal 保留。
- 模擬 `prefers-reduced-motion: reduce` 且手動偏好為開時，控制讀作「動態背景：已減少」，scene `data-motion = off`，cloud／Hero／score 的 computed animation 均為 `none`。
- 修正純資訊 data card 的四個多餘 Tab stops；所有互動仍是原生 button／link／summary，頁面有 skip link、唯一 main／h1、繁中 lang、可見 focus。所有可見互動控制均有名稱；沒有正數 tabindex、非語意 onclick 或未隱藏的裝飾 SVG。
- 主要色彩對比實算：主要文字 17.10:1、次要文字 9.99:1、品牌／focus 10.09:1、警戒文字 8.95:1、危險文字 8.76:1、主按鈕 7.12:1。

| Viewport | 實際結果 |
| --- | --- |
| 360 × 800 | scroll width 345 < 360；Hero bottom 445px、建議 bottom 377px；控制項無小於 44×44px。 |
| 390 × 844 | scroll width 375 < 390；Hero bottom 442px。 |
| 768 × 1024 | scroll width 753 < 768；Hero／因素卡維持清楚單欄層級。 |
| 1440 × 900 | scroll width 1425 < 1440；Hero 718px 與因素區 418px 並排。 |

active storm 2 秒 production 取樣為 `LayoutCountDelta = 0`、`LayoutDuration = 0`、TaskDuration 約 302 ms；關閉 motion 後同樣為 0 layout、ScriptDuration 0、TaskDuration 約 58 ms。console 為 0 error／warning。

### 最終品質命令

| 命令 | 結果 |
| --- | --- |
| `npm run lint` | 通過；ESLint 0 error。 |
| `npm test` | 通過；16 test files、287 tests passed。 |
| `npm run build` | 通過；Next.js 16.2.10 production build，`/api/outlook` 為 dynamic route。 |
| `npm run typecheck` | 通過；route types generated，TypeScript 0 error。 |

本輪沒有建立 commit、推送、部署或上傳 GitHub。

## 2026-07-30：未來兩小時降雨臨近預報

### 官方資料重驗

以香港天文台／DATA.GOV.HK 官方頁面、資料字典及實際 CSV 交叉核對：

- DATA.GOV.HK 列明英文 CSV 每 12 分鐘更新，提供未來兩小時四段半小時累計雨量，不需要 API key。
- 一頁官方資料字典確認嚴格五欄 header、`YYYYMMDDHHMM` 香港時間、經緯度 degree、半小時累計毫米及 provisional data 說明。
- 2026-07-30 17:25 HKT 檢查的實際 CSV 約 2.7 MB，共 58,564 筆資料列，即 \(121 \times 121 \times 4\)。該 snapshot 更新於 17:12，四段結束於 17:42、18:12、18:42、19:12。
- 天文台產品說明確認約 2 公里格點、格內不解析及快速發展／減弱／改變方向雨區可造成誤差；官方圖例確認 `<2.5`、`2.5–5`、`>5 mm` 分界。
- 保存的 CSV fixture 只抽取實際回應兩個格點的八列，沒有讓自動測試依賴 live API。

### 資料、時間及失效安全

- 串流 transport 實際計算解壓後 bytes，固定 5 MiB、100,000 rows、8 秒完整 deadline；測試涵蓋 headers 永不完成、body 尚未完成、Content-Type 缺失／錯誤、null body、非法 UTF-8、超限、失敗不 cache 及並行 dedupe。
- Parser 測試涵蓋 BOM／空白、嚴格五欄、混合更新時間、非法日曆／座標、缺少時段、代表格點非法值致命及非代表格點問題可恢復。
- 四段保留來源 `updatedAt` 的原始 30 分鐘區間。測試確認 17:36 查看 17:12 snapshot 時只剩 96 分鐘覆蓋；進行中第一段不改寫開始時間、不按比例縮放。
- Nowcast 超過 24 分鐘即 stale；stale、failed、malformed 或 timeout 不進入計分，也不顯示舊值。10 分鐘 cache refresh 失敗後不採 stale-if-error。
- Server snapshot 只有十八區 72 個值及四個全港衍生值；browser runtime validator 要求單一位置四段、時間遞增／不重疊／每段 30 分鐘、coverage／partial／first window／peak 一致，以及五個來源完整且唯一。

### 評分、UI 及私隱回歸

- 三個降雨來源合併成單一 `rain-risk`；測試涵蓋 0.5、2.5、5、>5 mm 邊界、近／遠時段、三種模式、四段不累加、跨來源 tie-break、首個連續雨段與較後 peak／driver。
- Nowcast 單獨失敗時 payload 為 `partial`，但不加入 ignored factor 或 score cap；Hero 維持「資料齊備」，banner 明示目前分數仍按已確認即時觀測及警告計算。只有 nowcast 成功而四個核心來源失敗時仍是 `error`。
- E2E 驗證未來一小時雨訊號會更新 Hero 與既有降雨卡，但不把 WeatherScene 切成雨景；另驗證 nowcast-only failure、地區／模式切換、定位允許／拒絕、重試、鍵盤 focus、reduced motion 及 360px 無水平 overflow。
- 精確位置的處理沒有改變：browser 只在記憶體把座標轉成 canonical district id，server 及 nowcast route 不接收 latitude／longitude。

### 最終品質閘門

- `npm run lint`：通過。
- `npm run typecheck`：通過。
- `npm test`／`npm run test:coverage`：18 個 test files、351 項測試全數通過。
- Coverage：statements 90.73%、branches 83.07%、functions 94.23%、lines 93.54%，全部高於設定門檻。
- `npm run build`：Next.js production build 通過；`/api/outlook` 保持 dynamic route。
- `npm run test:e2e`：Chromium 11 項全數通過。

已知限制：地區仍以近似中心點的最近約 2 公里格點代表，不是區界面積預報；香港整體逐段最高值偏保守；臨時自動預報可能受地形及快速發展雨區影響；10 分鐘 cache 暫未實作 stale-if-error；沒有地圖、雷達動畫、通知或概率預報。
