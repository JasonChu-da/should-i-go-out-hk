# 背景天氣場景沒有按實際天氣更新：最終批准版修正計劃

> 本文件的調查基準反映實作前狀態；實作後的實際變更與驗證結果以本次工作報告及 git diff 為準。



## 一、已執行調查與證據



調查基準：



- 分支：`work/review-cleanup-20260802`

- Commit：`1aafc5c1347dd48aaa8b63d550c069af73a9fa64`

- `git status --short`：無輸出，工作樹乾淨。

- `docs/weather-scene-fix-plan.md`：該調查基準建立時尚未存在；本計劃文件現已建立。



2026-08-03 13:24:22 HKT 重新取得正式 `/api/outlook?location=hong-kong`：



| 訊號 | 原始時間 | 正規化時間 | 年齡 | 門檻 | 結果 |

|---|---|---|---:|---:|---|

| 天氣圖示 `[62]`（微雨） | `2026-08-03T10:00:00+08:00` | `02:00:00Z` | 204.38 分鐘 | 90 分鐘 | stale |

| 過去一小時雨量 `0 mm` | `12:45:00+08:00` | `04:45:00Z` | 39.38 分鐘 | 90 分鐘 | fresh |

| 氣溫 `28°C` | `13:00:00+08:00` | `05:00:00Z` | 24.38 分鐘 | 90 分鐘 | fresh |

| 警告快照 | 擷取時間 `05:24:24.185Z` | UTC | 比 `generatedAt` 快 1.502 秒 | 30 分鐘及 5 分鐘 clock skew | fresh、完整、無警告 |

| Nowcast | `202608031312` | `05:12:00Z` | 12.38 分鐘 | 24 分鐘 | fresh |

| 本港預報 | `12:45:00+08:00` | `04:45:00Z` | 39.38 分鐘 | 12 小時 | fresh |

| AQHI | `12:30:00` HKT | `04:30:00Z` | 54.38 分鐘 | 3 小時 | fresh |



Nowcast 當前時段為 13:12–13:42 HKT、雨量 `0.01 mm`，低於既有 `RAINFALL_NOWCAST_SIGNAL_MM = 0.5` 門檻。五個來源狀態均為 `ok`。



正式回應標頭為：



- `Cache-Control: private, no-store, max-age=0`

- `X-Vercel-Cache: MISS`

- `Age: 0`



Headless Chromium 實測：



- SSR HTML：`data-outlook-state="loading"`、`data-scene="neutral"`，載入 neutral-day 資產。

- Hydration／API 完成後：`data-outlook-state="ready"`，但仍是 `data-scene="neutral"`、`data-period="day"`。

- 實際背景：`neutral-desktop.webp`，圖片完成載入，尺寸 1660×948。

- Canvas：維持預設 300×150、沒有 viewport 樣式，代表降雨 effect 未啟動。

- Console error／page error：0。



受控執行現有 `deriveWeatherScene()` 的結果：



- stale icon + fresh `1.2 mm` 雨量 → neutral。

- stale icon + fresh WTS 雷暴警告 → storm。

- fresh rain icon + stale 雨量 → neutral。

- warning unavailable + fresh `1.2 mm` 雨量 → neutral。

- fresh clear icon + fresh `0 mm` 雨量 → clear。



基線測試：



```text

npx vitest run tests/derive-weather-scene.test.ts tests/freshness.test.ts tests/browser-client.test.ts tests/route.test.ts

```



結果：4 個 test files、65 個 tests 全部通過。



資產檢查：共有 42 張 WeatherScene WebP；neutral、rain、storm 的日／暮／夜及 mobile／desktop 共 18 個必要路徑全部存在。



## 二、已確認根本原因



### 主要根因：場景 selector 把獨立訊號錯誤串成必要條件



`lib/weather-scene/derive-weather-scene.ts` 的 `deriveWeatherScene()`：



- 第 186–187 行先檢查：



&#x20; `conditionIcons.status !== "fresh" || conditionIcons.value === null`



&#x20; 命中便直接返回 neutral。



- 地區雨量要到第 193–202 行才被評估，因此 stale icon 會阻止 fresh positive rainfall 生效。

- 第 189–190 行亦把 fresh rainfall 設為圖示判斷的必要條件，令 fresh rain／storm icon 可能因雨量 stale 而被錯誤停用。

- 第 153–157 行把 warning source unavailable／incomplete 視為全場景失敗，會同樣忽略其他 fresh 訊號。



這些行為不是 freshness 門檻或 React 偶發問題，而是 `docs/DECISIONS.md` D-019 明確記錄的舊有保守政策；該政策已不符合「各天氣訊號獨立 freshness」的新產品要求。



### 次要根因：場景 selector 完全沒有 nowcast 輸入



`WeatherSceneData` 第 61–74 行只包含：



- `conditionIcons`

- `rainfallMm`

- `temperatureC`

- `warnings`



`OutlookPayload.rainfallNowcast` 雖已完成 fetch、validation、normalization 和 freshness 標記，卻沒有傳入或用於場景選擇。



### 載入前後均為 neutral 的原因



- `OutlookApp` 初始 state 是 `status: "loading", payload: null`；`deriveWeatherScene(null)` 第 140–141 行按設計返回 neutral-day。

- API 完成後，第 254 行把新 payload 寫入 state；第 453 行的 `useMemo(..., [payload])` 會重新執行 selector。

- selector 因 stale icon 再次返回同一個 `neutral:day:caution`。

- `WeatherBackground` 第 109–127 行正確監察 scene key；由於新舊 key 相同，它不需要切換圖片。

- 因此問題是重新 render 後仍得到相同 selector 結果，不是 React 沒有更新。



### 已排除的原因



- 時區：HKO 時間必須帶 offset；AQHI 無 offset 時明確按 `+08:00`；日夜使用 `Asia/Hong_Kong`。現有邊界測試通過。

- 快取：API route 為 `force-dynamic`；browser fetch、route response、Service Worker API 分支均為 `no-store`。正式回應亦是 Vercel MISS。

- stale closure／dependency：`OutlookApp`、`WeatherBackground`、`RainCanvas` dependencies 完整。

- mount-only Canvas：`RainCanvas` effect 依賴 `[enabled, intensity]`，並有 cleanup。

- reduced motion：只令 `effectiveMotion` 關閉，不改 scene 或背景圖片。

- 圖片路徑、大小寫及部署資產：全部存在。

- 已知 fresh 雷暴警告：其判斷位於 icon guard 之前，受控執行證明 stale icon 不會阻止 WTS 顯示 storm。



## 三、預計修改內容



### 1. 集中修正純函數



修改 `lib/weather-scene/derive-weather-scene.ts`：



- 在內部 `WeatherSceneData` 加入既有 `rainfallNowcast.forecast`；不修改公開 `/api/outlook` schema。

- 保留現有 `WeatherSceneResult.reason` 人類可讀原因，不新增 reason-code abstraction。

- 移除 icon、rainfall、warning availability 作為其他訊號的全域必要條件。

- 每個訊號只在自己的 status 為 `fresh`、value 合法時生效。

- 增加最小純 helper，找出包含 `generatedAt` 的 nowcast 半小時區間，使用半開區間：



&#x20; `periodStartAt <= generatedAt < periodEndAt`



- Nowcast 只有當前區間且雨量 `>= 0.5 mm` 才可顯示 rain；未開始的 future-only 時段仍不可改變目前場景。



批准的優先次序：



1. null、整體 error、無效 `generatedAt` → neutral。

2. fresh warning snapshot 中已識別的 storm／惡劣天氣警告 → storm。

&#x20;  - 已驗證的嚴重警告可在 snapshot 部分不完整時保留 storm。

&#x20;  - stale／unavailable warning items 不使用。

3. fresh snapshot 中有未識別的 active warning → neutral caution，避免把未知警告顯示成安全場景。

4. fresh storm icon → storm。

5. fresh observed rainfall `> 0` → rain。

6. fresh 當前 nowcast period `>= 0.5 mm` → rain。

7. fresh rain icon → rain。

8. fresh WHOT warning、fresh `temperatureC >= 33` 或 fresh hot icon → hot。

9. fresh clear／cloudy／overcast icon →相應場景。

10. 沒有任何可用訊號 → neutral。



雨勢強度繼續重用現有規則：



- `0 < mm < 2.5` → light

- `2.5 <= mm < 10` → medium

- `mm >= 10` → heavy



### 2. React 與動畫層



原計劃不修改：



- `components/OutlookApp.tsx`

- `components/weather-scene/WeatherBackground.tsx`

- `components/weather-scene/WeatherScene.tsx`

- `components/weather-scene/RainCanvas.tsx`



實作重核對後確認 `OutlookApp`、`WeatherScene`、`RainCanvas` 的 state、props、effect dependencies 及 Canvas lifecycle 正常，這三個檔案維持不變。惟 PWA 離線 E2E 首次重跑發現：neutral safe state 的圖片在離線時載入失敗，`WeatherBackground` 原有一般 fallback 會復原上一張衍生場景圖層；因此在 `components/weather-scene/WeatherBackground.tsx` 加入最小安全分支：當目標 scene 是 neutral 時立即隱藏 previous layer，且 neutral 圖片失敗也保持 neutral，不影響一般 clear／rain／storm 交叉淡入及圖片失敗 fallback。



不增加 production debug log 或測試專用 production state；E2E 使用現有 DOM attributes、圖片 `currentSrc` 和 Canvas pixels 驗證。



### 3. 文件



- 在 `docs/DECISIONS.md` 新增決策，取代 D-019 的「icon／rainfall／warning 任一不可用便全域 neutral」及「完全不用 nowcast」部分；保留原決策歷史。

- 更新 `docs/ACCEPTANCE_CRITERIA.md`：

&#x20; - 當前 nowcast 可作 rain 訊號。

&#x20; - future-only nowcast 仍不可改變目前場景。

&#x20; - 場景 freshness 與評分安全規則分離。

- 按專案規則更新 `PLANS.md` checklist。

- 不修改 API 文件或 validation schema，因 payload 結構不變。



## 四、不可破壞的行為



- 不調高 90 分鐘、24 分鐘或其他 freshness 門檻。

- stale／missing／malformed 資料不可影響分數、建議或安全結論。

- warning unavailable／incomplete 仍必須令 scoring 保持受限；只解除其對視覺場景其他獨立訊號的封鎖。

- stale icon `[62]` 本身不可重新顯示 rain。

- future-only nowcast 不可顯示「正在下雨」。

- API、位置、錯誤回應和 SSR HTML不可存入 Service Worker Cache Storage。

- `/api/outlook` 必須維持 dynamic、browser `no-store` 及 response `no-store`。

- loading、offline、unavailable、整體 error 必須使用 neutral，不保留上一筆具誤導性的 rain／storm。

- SSR neutral 背景及資料完成後圖片載入成功才交接的行為保留。

- reduced motion 只停用非必要動畫，不能改變 rain／storm／clear 場景。

- 相同 visual key 的資料刷新不重啟動畫。

- 日／暮／夜算法、42 張資產矩陣、responsive `<picture>`、定位私隱、PWA／離線功能保持不變。

- 不新增 production dependency，不重設 UI，不改公開 API schema。

- 保持 TypeScript strict。



## 五、測試案例



### 單元測試



主要更新 `tests/derive-weather-scene.test.ts`：



1. fresh 晴天 icon → clear-day。

2. fresh rain icon，即使 observed rainfall stale → rain。

3. stale icon + fresh observed rainfall `> 0` → rain。

4. stale icon + fresh WTS／暴雨警告 → storm。

5. stale icon，其他訊號 missing／stale → neutral。

6. stale positive rainfall + fresh clear icon → clear，不能由 stale 雨量顯示 rain。

7. warning unavailable／incomplete + fresh observed rain → rain；scoring 的 warning uncertainty 規則保持不變。

8. canceled warning 不顯示 storm；expired warning繼續由 normalization 排除。

9. fresh current nowcast：

&#x20;  - `0.49 mm` → 不因 nowcast 顯示 rain。

&#x20;  - `0.5 mm` → rain。

&#x20;  - 只在未來 period 有雨 → 不顯示 rain。

10. nowcast period 的 start、end 及跨香港／UTC 日期邊界。

11. warning storm 優先於 rain；observed rain 優先於 hot。

12. fresh temperature `33°C` 且沒有雨 → hot。

13. unknown active warning → neutral caution。

14. null、error、所有訊號不可用 → neutral。

15. 每個非 neutral 結果包含指出實際來源的 `reason`。



更新 `tests/freshness.test.ts`：



- 加入 freshness 門檻前 1 ms。

- 保留門檻上 fresh、門檻後 1 ms stale。

- 保留 `+08:00`、UTC、future skew 和無 offset AQHI 測試。

- 覆蓋 weather 90 分鐘及 nowcast 24 分鐘邊界。



沿用 `tests/normalize-warnings-forecast.test.ts` 現有 CANCEL／expireTime 測試。



### Playwright E2E



更新 `e2e/outlook.spec.ts`，以現有 `page.route("**/api/outlook?*")` fixture 依位置回傳受控 payload，在同一頁、不 reload 地切換：



1. SSR／loading neutral → client clear。

2. clear → stale-icon + fresh-rain → rain。

3. rain → WTS warning → storm。

4. storm → clear。

5. 每一步確認：

&#x20;  - `main[data-scene]`

&#x20;  - `.weather-scene[data-scene]`

&#x20;  - `.weather-background-layer.is-current`

&#x20;  - 圖片 `currentSrc`、`complete`

&#x20;  - rain／storm Canvas 有非透明 pixels

&#x20;  - clear Canvas 已清空

6. API 失敗時由 rain／storm 回到 neutral，不殘留舊背景或雨線。

7. reduced motion 下 scene 和背景仍是 rain／storm，但 `data-motion="off"` 且 Canvas 無雨線。



更新 `e2e/pwa.spec.ts`：



- 保留 API `no-store` 與 Cache Storage allowlist。

- 手動放入測試用舊 `/api/outlook` cache entry，再提供不同的 network payload；確認受控頁面使用 network 新場景而非舊 cache。

- 測試結束移除該測試 cache。

- 驗證 API／位置 query、錯誤回應及首頁 SSR HTML不在 app-managed caches。



## 六、驗證命令



實作完成後依序執行並記錄實際測試數量：



```text

git diff --check

npm run lint

npm run typecheck

npm test

npm run test:coverage

npm run build

npm run test:e2e

npm run test:e2e:pwa

```



額外受控驗證：



- clear

- observed rain

- thunderstorm warning

- stale icon + fresh observed rain

- stale icon + fresh current nowcast

- future-only nowcast

- all sources unavailable

- API success → failure → recovery

- reduced motion



正式部署 smoke test：



- 檢查 `/api/outlook` 的 `Cache-Control`、`Age`、`X-Vercel-Cache`。

- 記錄各場景訊號的 raw／normalized timestamp、年齡與 freshness。

- 確認 SSR neutral，client ready 後依 fresh 訊號切換。

- 確認瀏覽器 console／page errors 為 0。



## 七、完成條件



只有以下條件全部成立才可宣告修正完成：



- stale icon 不再封鎖 fresh observed rain、current nowcast 或 fresh storm warning。

- stale／future-only 訊號仍不會觸發場景。

- 場景與評分使用分離且可解釋的安全規則。

- SSR neutral 能在 client payload 後切換 clear／rain／storm。

- 動態切換不需要 reload，背景、DOM、Canvas 同步更新。

- reduced motion 保持正確場景，只停用動畫。

- API／Service Worker 不提供舊天氣 payload。

- 所有 lint、typecheck、unit、coverage、build、一般 E2E、PWA E2E 實際通過並報告數量。

- 沒有新增 dependency、API schema 或無關 UI 改動。

- 工作樹只包含計劃內檔案，沒有 commit、push、PR 或 main 合併。



已知驗收預期：若部署時仍像本次正式樣本一樣只有 stale 微雨 icon、fresh observed rainfall 為 `0`、當前 nowcast 低於 `0.5 mm` 且沒有警告，修正後仍應顯示 neutral；這是正確拒絕過期訊號，不代表修正失效。




