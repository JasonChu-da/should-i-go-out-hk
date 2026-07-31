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

## 2026-07-16：Vercel 部署前檢查

- [x] 複核 Next.js dynamic Route Handler、Node.js runtime 相容性及 Vercel Hobby 部署限制
- [x] 複核四個政府 API 的 8 秒 timeout、並行 failure isolation、短期 instance-memory cache 及錯誤分類
- [x] 以 Vercel／Next.js 官方文件核對 Git 匯入、Node.js、Function duration、region、Hobby fair use 及網站操作流程
- [x] 擴充 README：免費方案前提、完整 Vercel 匯入設定、`hkg1`、部署後 smoke test、runtime 與 cache 限制
- [x] 執行 `npm run lint`、`npm run typecheck`、`npm test` 及 `npm run build`；15 files／259 tests 及 production build 全部通過
- [x] 核對最終 Git 差異只包含部署文件，且沒有部署、上傳或建立 commit

## 2026-07-16：首頁 UI／UX 重設計

- [x] 以桌面截圖、產品規格及現有元件完成第一階段設計審核
- [x] 定義「香港天空氣象卡片」資訊架構、responsive wireframe、色彩與字體 tokens
- [x] 實作緊湊位置列、活動模式、決策 Hero、四項因素、警告／預報及來源 accordion
- [x] 保留定位、十八區、資料錯誤、freshness、評分與所有 API 行為
- [x] 以最新 Web Interface Guidelines 審核 UI 並修復重要問題
- [x] 依 Vercel React Best Practices 複核元件、重繪及 bundle 行為
- [x] 驗收 desktop、360px mobile、鍵盤、focus、dark mode 及 reduced motion
- [x] 執行 `npm run lint`、`npm test`、`npm run build`；0 lint error、15 files／260 tests 及 production build 全部通過

## 2026-07-16：實際天氣驅動的沉浸式 WeatherScene

- [x] 閱讀全部專案文件、weather normalization、freshness、scoring、現有 UI 與指定設計／React skills
- [x] 實測四個官方端點並核對 HKO 天氣圖示編號；確認 icon、地區雨量、警告快照與香港時間足以作 deterministic scene mapping
- [x] 建立純函數 `deriveWeatherScene`、集中圖示／警告 mapping、scene themes 及完整單元測試
- [x] 在 normalization 保留 icon freshness，缺失／過時／警告未確認時使用 neutral 靜態場景
- [x] 建立全頁背景、SVG 雲層、Canvas 雨線、readability overlay、crossfade 與動態背景控制
- [x] 重整首頁 surface、typography 與 responsive hierarchy，同時保留定位、評分、警告及所有錯誤狀態
- [x] 建立只限 development 的 scene preview，驗收 clear／cloudy／rain／heavy rain／storm／neutral
- [x] 依 Web Interface Guidelines 與 Vercel React Best Practices 完成 accessibility／performance 稽核
- [x] 驗收 360×800、390×844、768×1024、1440×900、reduced-motion、鍵盤、focus、contrast 及無水平 overflow
- [x] 執行 `npm run lint`、`npm test`、`npm run build` 並記錄真實結果

## 2026-07-16：Harbour Sky 視覺系統及普通天氣環境動畫

- [x] 檢查現有 theme tokens、WeatherScene、香港時間、HKO icon mapping、雲雨實作、motion toggle 與測試
- [x] 以真實請求重新核對 HKO 即時天氣／警告／預報及環保署 AQHI 回應格式
- [x] 集中建立 Harbour Sky 藍色 design tokens，分離品牌色與安全／警戒／危險狀態色
- [x] 建立日間天空、晴朗夜空、稀疏星光、分層慢雲、環境光暈與陰天霧氣
- [x] 統一藍灰雨景、低亮度雷暴天空變化及 Canvas 動畫生命週期
- [x] 加入 Hero 邊緣流光、分數變更、因素卡及滑動模式切換微動畫
- [x] 擴充 development Weather Scene Preview 至指定十種驗收狀態
- [x] 驗收 360×800、390×844、768×1024、1440×900、reduced-motion、鍵盤、對比及動畫效能
- [x] 執行 `npm run lint`、`npm test`、`npm run build` 並記錄真實結果

## 2026-07-16：第二版本完整驗收

- [x] 檢查相對上一個 commit 的 tracked／untracked Git diff，確認第二版集中於首頁 UI、WeatherScene、Harbour Sky、動態控制、天氣圖示 freshness、文件及測試
- [x] 直接請求 HKO `rhrread`、`warnsum`、`flw` 及環保署 AQHI，並以 production `/api/outlook` 確認 4／4 官方來源均為 `ok`，runtime 沒有 mock／fixture
- [x] 驗證正常天氣、雷暴、黃／紅／黑雨、高溫、高 AQHI、夜間 UV 不適用、部分／全部 API 失敗、stale 及定位拒絕
- [x] 特別複核雷暴警告的三模式；純 WTS 規則為一般 6、運動 3、晾衫 3，實際當時連同濕度及有雨預報為 6／1／0，結論及建議符合模式風險
- [x] 修正手動關閉後 Hero／分數／模式列微動畫仍運作；現在所有非必要 CSS motion 與 Canvas loop 一併停止，功能性 14 秒重載提示保留
- [x] 修正四張純資訊卡不必要的 `tabIndex=0`，並恢復 skip-link 目標的可見 focus indicator
- [x] 實測 360×800、390×844、768×1024、1440×900；無水平 overflow，控制項至少 44px，主要結果在手機首屏內
- [x] 複核鍵盤原生控制、focus、螢幕閱讀器名稱、heading／main 語意、文字對比及 console；沒有未命名控制、正 tabindex 或 console error／warning
- [x] 執行 `npm run lint`、`npm test`、`npm run build` 及 `npm run typecheck`；16 files／287 tests、production build 及 TypeScript 全部通過
- [x] 沒有建立 commit、推送、部署或上傳 GitHub

## 2026-07-27：Production-readiness audit

- [x] 重新閱讀產品規格、API 來源、驗收準則、實作計劃及技術決策
- [x] 檢查功能、TypeScript、API 邊界、錯誤處理、效能、安全、無障礙、響應式、測試、重複／未使用程式碼與 README
- [x] 先執行未修改基準的 `lint`、`typecheck`、`test` 及 production `build`
- [x] 以真實請求重驗 HKO 三個端點、AQHI 端點及官方警告代碼文件
- [x] 實測 production UI 的 320／360px、桌面、水平 overflow、點按尺寸、語意地標及 console
- [x] 修正 `Very high` 大小寫差異令高 AQHI 站點被錯誤排除，並加入 parser 與聚合評分回歸測試
- [x] 修正批次後執行 `npm run lint`、`npm run typecheck`、`npm test` 及 `npm run build`
- [x] 沒有建立 Git commit

## 2026-07-27：第一階段修正—Coverage 與 Playwright E2E

- [x] 檢查現有 Vitest、Next.js、UI 測試、定位與瀏覽器載入架構
- [x] 安裝及設定 `@vitest/coverage-v8`，加入真實核心程式碼 include／exclude 與最低門檻
- [x] 量測 coverage 缺口，只為高風險 aggregate failure isolation 補充有價值的測試
- [x] 安裝及設定 Playwright，使用本機 web server 與 `/api/outlook` route interception
- [x] 覆蓋正常結果、地區／模式、定位成功／拒絕、錯誤重試、鍵盤／焦點、reduced motion、360px overflow 及 console
- [x] 分別完成 coverage 與 E2E 驗證，再執行全部最終品質閘門
- [x] 不改變產品功能、評分規則或視覺設計；不建立 Git commit

## 2026-07-27：GitHub Actions CI

- [x] 建立 push／pull request 觸發、最小唯讀權限及合理 timeout 的 CI workflow
- [x] 使用專案 Node.js 需求、npm cache、`npm ci` 及 Playwright Chromium system dependencies
- [x] 執行 lint、typecheck、完整 Vitest coverage suite、production build 及 mock E2E
- [x] 避免重複執行同一套 Vitest 測試
- [x] 保存 coverage artifact，並在 Playwright 失敗時保存 report、trace、截圖及 test results
- [x] 完成 workflow YAML／結構靜態檢查及全部本機品質閘門
- [x] 核對 staged diff 並建立 CI commit

## 2026-07-30：未來兩小時降雨臨近預報

- [x] Phase 1：建立官方 CSV endpoint、串流 transport、嚴格 parser、fixture 及資料層測試
- [x] Phase 2：建立 domain contract、freshness、十八區格點映射、compact snapshot 及 normalization 測試
- [x] Phase 3：整合單一 `rain-risk` 候選器、跨來源 tie-break 及評分測試
- [x] Phase 4：整合第五來源、核心／附加來源狀態及 browser runtime validation
- [x] Phase 5：更新降雨卡、Hero limited 語義、partial banner、文案、CSS 及 UI／scene 測試
- [x] Phase 6：更新 E2E、文件及 QA，執行完整品質閘門與 diff review

## 2026-07-30：可安裝 PWA 與安全離線狀態

- [x] 建立原生 manifest、Harbour Sky PNG／maskable／Apple 圖示及 metadata
- [x] 建立版本化 service worker、有限靜態 cache、network-only API 與自包含離線頁
- [x] 建立 production-only 註冊、iPhone Safari 安裝提示及受限 storage fallback
- [x] 建立 latest-request-wins 的 loading／ready／offline／unavailable 狀態
- [x] 驗證離線及失敗時不 render 任何舊天氣、評分、建議或資料驅動場景
- [x] 建立 production PWA E2E、同 URL worker v1→v2 更新 proxy 及 CI coverage
- [x] 更新決策、README、QA 文件並執行完整品質閘門與最終 diff review
