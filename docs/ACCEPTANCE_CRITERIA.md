# MVP 驗收準則

證據更新：2026-08-02，程式基準 commit `14a0ba8`。`[x]` 只代表已有程式碼、測試或本輪實際指令證據；headless Chromium／viewport 模擬不等於 Android 或 iPhone 實機驗收。

## 專案設定

- [x] 應用可用 README 記錄的單一 `npm run dev` 指令啟動；一般 E2E 亦成功自行啟停 dev server。
- [x] TypeScript strict mode 已在 `tsconfig.json` 啟用。
- [x] `npm run lint -- --no-cache` 通過。
- [x] `npm run typecheck` 通過。
- [x] `npm test` 通過；目前數量只記錄於 README／PLANS 的日期化快照。
- [x] `npm run build` production build 通過。
- [x] README 包含本機啟動、驗證、production 啟動及部署指引。

## 資料

- [ ] 正式環境可即時取得 HKO current weather；程式與 fixture 測試存在，但本輪未對部署環境做 live smoke test。
- [ ] 正式環境可即時取得 HKO warning；程式與 fixture 測試存在，但本輪未對部署環境做 live smoke test。
- [ ] 正式環境可即時取得 AQHI；程式與 fixture 測試存在，但本輪未對部署環境做 live smoke test。
- [ ] 正式環境可即時取得 HKO gridded rainfall nowcast ZIP；server route、transport 與 sanitized fixture 已測試，但本輪未對部署環境做 live smoke test。
- [x] 外部 API 及 browser payload 均有 runtime validation（`tests/parsers.test.ts`、`tests/outlook-payload-validation.test.ts`）。
- [x] Missing optional fields 不會令應用崩潰（parser／normalization tests）。
- [x] UI 顯示來源發布時間及本站擷取時間（UI／E2E tests）。
- [x] Stale 資料會被辨識並排除於計分（freshness／normalization／scoring tests）。
- [x] API request 有 timeout、HTTP、Content-Type、size 及 error handling（API client tests）。
- [x] 自動測試只使用本地 fixtures／route interception，不呼叫 live government APIs。
- [x] Nowcast parser 要求官方完整 17 欄 multilingual header 及四個唯一、連續半小時時段。
- [x] Nowcast 時間以香港時間解讀，period 保持以來源 `updatedAt` 為基準。
- [x] Server cache 只保留十八區 × 四時段及四個全港衍生值；browser payload 只含所選位置的四時段。
- [x] ZIP transport enforce 512 KiB compressed、5 MiB decompressed、100,000 rows 及完整 8 秒 deadline。
- [x] 超過 24 分鐘的 nowcast 標記 stale 且不參與計分。

## 定位

- [x] 自動測試覆蓋瀏覽器允許 geolocation 並選出沙田。
- [x] 精確座標只在 browser memory 轉成 canonical district id，不送往 server 或永久保存。
- [x] 拒絕、逾時及不支援定位不會破壞應用。
- [x] 十八區一按 fallback 及香港整體 fallback 均已實作及測試。
- [x] UI 不要求地址或長文字輸入。
- [x] 每區以 deterministic nearest grid point 套用全部四個 period。

## 介面

- [x] Headless Chromium 360×800 viewport 可在首屏完成主要決策；實機項目另列於下方。
- [x] Score、verdict、原因及建議清楚可見並具語意化 progressbar。
- [x] 三種活動模式可一按切換並即時重新計分。
- [x] Loading、partial failure、complete failure、retry 及資料 malformed 狀態有 UI／E2E 覆蓋。
- [x] 資料來源、發布時間及擷取時間可見。
- [x] 360px、390px 及 desktop viewport 無水平 overflow；桌面 scrollbar gutter 不侵佔手機寬度。
- [ ] Dark mode 目前有固定 dark color-scheme 與既有人工紀錄，但本輪沒有獨立自動視覺 assertion 或實機覆核。
- [x] 狀態不只依賴顏色，並有文字、ARIA／語意標籤及鍵盤 focus tests。
- [x] 同一降雨卡分開顯示過去一小時觀測與未來降雨，不新增第五張主卡。
- [x] 未來降雨顯示剩餘覆蓋、首個連續雨段、來源時間及近似時間範圍。
- [x] 香港整體文案使用「香港部分地區」／「十八區代表格點」，不暗示全港每處下雨。
- [x] Future-only rain 不會把目前 WeatherScene 切成 rain scene。

## 評分

- [x] Scoring 與 UI 分離，為 pure deterministic function。
- [x] Severe warnings 可覆蓋一般分數；warning unavailable 會限制過度正面的結論。
- [x] 一般外出、跑步／踩單車及晾衫均有單元測試。
- [x] 解釋會列出改變分數的因素。
- [x] 過去雨量、nowcast 與 forecast text 合成單一 `rain-risk`，不疊加扣分。
- [x] 相同 rain penalty 依 explicit time、proximity、nowcast → observation → forecast text 決勝。
- [x] 進行中的首段仍標示完整半小時累積，不按剩餘時間比例縮放。
- [x] Nowcast 單獨失敗不會加入 ignored factor、限制分數或強制 Hero 顯示「資料有限」。

## 必要測試情境

- [x] Normal weather、light rainfall、heavy rainfall、very hot weather、high UV 及 high AQHI。
- [x] Severe weather warning、stale AQHI、missing temperature、malformed API response。
- [x] One API unavailable、all APIs unavailable、geolocation denied。
- [x] Valid／malformed rainfall nowcast、district mapping 及 Hong Kong-wide aggregation。
- [x] First contiguous rain window、partially elapsed period 及 reduced remaining coverage。
- [x] Stale、timeout、oversized、unavailable nowcast fallback 及 cross-source tie-break。

## PWA、實機與部署

- [x] Headless Chromium 驗證 manifest、icons、installability、offline、Cache Storage allowlist 及 API network-only。
- [x] 同一 `/sw.js` URL 的新版會 waiting，舊 clients 關閉後 activate，並只清理本應用舊 cache。
- [ ] Android Chrome 實際安裝對話框與 standalone 啟動仍需部署後以 Android 實機驗證。
- [ ] iPhone Safari 分享選單、「加入主畫面」及 standalone 行為仍需部署後以 iPhone 實機驗證。
- [ ] 正式 HTTPS 網址、Vercel Function region、live `/api/outlook` 及五個官方來源仍未在本輪實際部署驗證。

## 私隱

- [x] 沒有 login、account、database、analytics、ads 或 API secret。
- [x] 精確位置不送往 analytics／server，亦不永久保存。
- [x] README 已逐項列出三個版本化 localStorage key；均不含位置、天氣 payload 或其他敏感資料。
- [x] Runtime 不使用 sessionStorage；storage unavailable 時安全降級。
