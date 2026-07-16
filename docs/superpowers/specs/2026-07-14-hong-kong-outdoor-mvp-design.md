# 「香港現在適合出門嗎？」MVP 設計

日期：2026-07-14

本設計把已核准的 product spec、API source rules 與 acceptance criteria 轉成實作邊界；不新增登入、資料庫、地圖、通知、分析追蹤或未來兩小時網格雨量。

## 架構

Next.js App Router 提供單頁手機介面與單一 `/api/outlook` 聚合 route。伺服器 API clients 並行擷取 HKO 即時天氣、警告、地區預報及環保署 AQHI；每個來源獨立 timeout、cache、validate、normalize 與 freshness 判斷，單一來源失敗不拖垮其他來源。瀏覽器取得的精確位置只用來本地選擇十八區，route 只收到地區 id。

## 資料流

`政府 JSON → HTTP client → runtime parser → normalized observations → freshness → location/station selection → stable API response → pure scoring → UI`

stale 資料可連同狀態與原始發布時間顯示，但 scoring 只接收 fresh observations。警告 API 成功空集合與 unavailable 是兩種明確狀態。全部來源失敗時 API 回傳穩定 failure envelope，UI 不顯示分數。

## 介面

首個 viewport 先顯示產品名、地區／整體標籤、資料時間、三模式切換、0–10 分數、結論、原因與最多三項建議。下方顯示四張資料卡、警告、來源、限制與免責聲明。定位被拒絕後顯示十八區按鈕和「香港整體」，不重複要求權限。狀態同時用文字、圖示／符號與視覺樣式表達。

## 計分與錯誤

計分由 10 開始，所有門檻集中定義。嚴重警告直接覆蓋最高分；其他 fresh 因素按模式扣分。warning unavailable 或嚴重缺乏觀測時使用信心上限，不把 missing 當作零風險。每個扣分因素產生可追蹤 explanation 與 action，排序後只顯示最多三項。

## 驗證

Vitest 使用本地 fixture，覆蓋 parser、normalization、freshness、location、failure aggregation 和三模式 pure scoring。完成每個 phase 後執行相關測試，最終必須 `npm run lint`、`npm test`、`npm run build` 全部通過，並手動檢查 360px、桌面、深色模式、鍵盤焦點與 44px 觸控目標。

## 自我審查

- 無 TODO、placeholder 或未決產品範圍。
- 架構、錯誤語義與 UI 狀態一致。
- API schema 不依印象；已另存實測紀錄。
- 沒有要求使用者再選擇普通技術方案，符合直接實作指示。
- 依使用者 Git 規則保留為未 commit 變更。

