# 「香港現在適合出門嗎？」MVP 實作計劃

更新日期：2026-07-16

狀態標記：`[x]` 已完成並驗證、`[ ]` 尚未完成。只有通過該階段的驗證，才會標記完成。

## Phase 1：API 探測、專案結構與決策文件

- [x] 完整閱讀 `AGENTS.md`、`docs/PRODUCT_SPEC.md`、`docs/API_SOURCES.md`、`docs/ACCEPTANCE_CRITERIA.md`
- [x] 檢查 repository 與 Git 狀態；初始化 Git，但不建立 commit
- [x] 以真實 HTTP GET 探測 HKO `rhrread`、`warnsum`、`flw` 與環保署 AQHI
- [x] 記錄狀態碼、Content-Type、實際 schema、時間戳、可選／缺失欄位與文件差異
- [x] 建立 `docs/API_OBSERVATIONS.md`
- [x] 建立 `docs/DECISIONS.md`
- [x] 建立並自我審查 MVP 架構設計
- [x] 建立 Next.js、TypeScript strict、ESLint、Vitest 專案基線
- [x] 建立分離的 API、validation、normalization、location、freshness、scoring、UI 目錄（後續 phase 隨實作加入專責檔案）
- [x] Phase 1 驗證：基線 lint、test 與 build 通過（1 test）

## Phase 2：API clients、runtime validation、normalization 與 fixtures

- [x] 建立有 timeout、HTTP／Content-Type 檢查、短期 server cache 的政府 API client
- [x] 為 `rhrread` 建立容忍可選欄位的 runtime parser
- [x] 為 `warnsum` 建立動態鍵與未知警告兼容的 runtime parser
- [x] 為 `flw` 建立 runtime parser
- [x] 為 AQHI 建立可接受數字、數字字串及 `10+` 的 runtime parser
- [x] 保留來源發布時間與獨立 `retrievedAt`
- [x] 建立 weather、rainfall、UV、warnings、forecast、AQHI normalization
- [x] 保存整理後的實測 fixture；另建 severe、missing、malformed 與 stale fixture
- [x] 建立 parser、API client 與 normalization 單元測試
- [x] Phase 2 驗證：相關測試、lint 與 build 通過

## Phase 3：freshness、location fallback 與 scoring engine

- [x] 集中定義 weather 90 分鐘、AQHI 3 小時、warning snapshot 30 分鐘、forecast 12 小時門檻
- [x] stale／invalid／明顯未來時間資料只顯示狀態，不以舊值參與環境風險計分
- [x] 建立十八區 canonical mapping、HKO 雨量／氣溫站與官方 AQHI 代表站映射
- [x] 在瀏覽器記憶體內把 geolocation 轉成地區；不傳送或儲存精確座標
- [x] 建立拒絕、逾時、不支援定位時的十八區與香港整體 fallback
- [x] 建立 pure、deterministic scoring function 與集中門檻
- [x] 建立 warning override、warning unavailable 上限、扣分解釋與最多三項建議
- [x] 涵蓋一般外出、跑步／踩單車、晾衫模式測試
- [x] Phase 3 驗證：freshness、location、scoring 與 failure tests、lint、build 通過

## Phase 4：手機介面、模式切換與錯誤狀態

- [x] 建立單一 `/api/outlook` server route，並行聚合四個官方來源且隔離個別失敗
- [x] 建立手機首屏 score、結論、一句原因、最多三項行動建議
- [x] 建立一般外出／跑步踩單車／晾衫單手模式切換
- [x] 建立天氣與體感、降雨、UV、AQHI 資料卡
- [x] 建立生效警告、資料來源、發布／擷取時間、stale 與免責聲明
- [x] 建立 loading、partial failure、complete failure、retry 與 HKO 外部出口
- [x] 建立定位狀態、十八區一鍵選擇與香港整體模式
- [x] 支援 360px、桌面、鍵盤、44px 觸控目標、非純色狀態及系統深色模式
- [x] Phase 4 驗證：UI 狀態測試、lint、test 與 build 通過

## Phase 5：完整驗收、文件與 production build

- [x] 逐項核對 `docs/ACCEPTANCE_CRITERIA.md`
- [x] 覆蓋 normal、light/heavy rain、very hot、high UV、high AQHI、severe warning
- [x] 覆蓋 stale AQHI、missing temperature、malformed response、one/all API unavailable
- [x] 覆蓋 geolocation denied 且不重複請求權限
- [x] 執行 accessibility 與 responsive 結構檢查；自動截圖工具限制已記錄於 `docs/QA_REPORT.md`
- [x] 完成 README：本機啟動、測試、production build、免費部署與資料限制
- [x] 執行 `npm run lint`（通過）
- [x] 執行 `npm test`（14 files、251 tests 通過）
- [x] 執行 `npm run build`（production build 通過）
- [x] 記錄實際結果與已知限制於 `docs/QA_REPORT.md`

## Post-MVP 修正：載入狀態必定收斂

- [x] 實測目前首頁、8 個 client chunks 與 `/api/outlook` 回應；route 約 0.24 秒回傳，截圖停在 SSR 初始狀態
- [x] 為瀏覽器到內部 route 的請求加入獨立 12 秒 deadline 與可區分的 abort handling
- [x] 確保 timeout、HTTP、格式、網絡及非 cleanup AbortError 都會進入可重試的完整失敗狀態
- [x] 為 JavaScript 未接管頁面的情況提供可操作的整頁重載後備
- [x] 新增 browser route client 8 項回歸測試，且不依賴 live API
- [x] 執行 `npm run lint`、`npm test` 與 `npm run build`；15 files、259 tests 及 production build 全部通過

## 2026-07-16：專案驗收及修復複核

- [x] 重新完整閱讀 `AGENTS.md`、`PLANS.md`、`README.md` 及 `docs/` 全部文件
- [x] 檢查 `package.json` scripts、實作分層、測試案例及 Git 工作目錄；沒有重新初始化、重寫或建立 commit
- [x] 依指定次序執行 `npm run lint`、`npm test`、`npm run build`；0 lint error、15 files／259 tests 及 production build 全部通過；另執行 `npm run typecheck` 通過
- [x] 以 2026-07-16 真實 HTTP 請求重新探測 HKO `rhrread`、`warnsum`、`flw` 及環保署 AQHI；四個官方 JSON 均成功解析
- [x] 以具外網權限的 production server 端到端呼叫 `/api/outlook?location=hong-kong`；四來源均為 `ok`，證實 runtime 並非使用 fixture／static mock
- [x] 以無外網 production server 實測四來源全失敗；畫面收斂至不顯示分數的完整失敗狀態，並提供重試、HKO 出口及逐來源失敗標示
- [x] 複核 partial failure、missing、malformed、stale、future timestamp、warning unavailable 及 stale 不計分測試
- [x] 搜尋 runtime 原始碼，確認沒有 localStorage、sessionStorage、database、analytics、API key 或精確位置傳送／持久化
- [x] 以 360 × 800 瀏覽器 viewport 實測：無水平 overflow、所有按鈕至少 44px、首屏完整顯示標題／更新時間／模式／分數／結論／摘要／建議
- [x] 實測十八區清單、選擇中西區、切回香港整體及三種活動模式即時重新計分
- [x] 以 1280 × 720 viewport 實測桌面四欄資料卡且無水平 overflow；複核 dark mode 及 reduced-motion CSS
- [x] 拒絕定位由單元測試確認只請求一次並回傳 `denied`；受控瀏覽器實測 timeout fallback 使用相同香港整體／十八區介面
- [x] 未發現需要修改產品程式碼的規格內缺口；本輪只更新驗收文件
