# 「香港現在適合出門嗎？」MVP 實作計劃

更新日期：2026-08-10

狀態標記：`[x]` 已完成並驗證、`[ ]` 尚未完成。只有通過該階段的驗證，才會標記完成。

## 2026-08-14：代碼健康審計與技術債治理

### 修改前問題清單

- **P0：沒有發現。** 現有 threat model 下沒有可證實的資料損失、可遠端利用的高危漏洞或全站嚴重不可用路徑；2026-08-14 `npm audit` 亦為 0 vulnerabilities。
- **P1：附加 nowcast 可錯誤建立評分充分性。** 證據：`lib/scoring/score.ts` 的 `scoreOutlook` 把 fresh `rainfallNowcast` 加入 `relevantFreshCount`；因此四個核心來源全部缺失但 nowcast 成功時，純函式仍可從 10 分產生結論，違反 D-008「即使附加 nowcast 成功亦不顯示分數」。目前 `OutlookApp` 會因 `payload.status === "error"` 擋住畫面，故屬被上層遮蔽、其他 caller 仍可觸發的核心契約 bug。最小修復是把計數明確收窄為核心證據並補純函式 regression test。風險只限全核心證據不可用的邊界；正常、partial 及 nowcast penalty 不應改變。
- **P1：一般 JSON client 拒絕 response 時沒有一致釋放 transport。** 證據：`lib/api/client.ts` 的 `requestJson` 在 HTTP／Content-Type 錯誤直接 return，未 cancel body 或 abort；Content-Length／串流超限又等待 `cancel()`，cleanup promise 若不收斂會把明確 `too-large` 拖成逾時。相同根因已在 nowcast client 處理。最小修復是 fire-and-forget cancel、立即 abort，並以 cancel/abort 及永不完成 cleanup 的 regression tests 覆蓋。風險是自訂 fetch double 對 abort 的非標準反應；結果型別及 cache 契約不變。
- **P1：新背景圖片失敗會連上一張可用圖片也隱藏。** 證據：`components/weather-scene/WeatherBackground.tsx` 用單一 `imageFailed` 套到 previous/current 兩層；incoming 圖觸發 error 後 reducer 回退 previous，但同一 state 又把 previous 設為 `visibility:hidden`，違反 D-039 的「失敗時保留上一張可用背景」。最小修復是刪除跨圖片共享的 failure state，只讓實際失敗的 `<img>` 隱藏並沿用既有 reducer 回退；加入真實瀏覽器轉場失敗 regression。風險集中於圖片 load/error 交接，既有首載全失敗 fallback 測試必須繼續通過。
- **P2：濕度值與 freshness 狀態可能被 UI 隱藏。** 證據：`components/DataCards.tsx` 只在氣溫有值時 render 濕度；氣溫缺失但濕度 fresh 時，會隱藏實際參與運動／晾衫評分的濕度。濕度 stale 且仍有值時亦只顯示數字，不顯示「可能已過時，不計分」。最小修復是在同一卡片獨立顯示可用濕度及其非 fresh 狀態，補 SSR regression tests。風險是體感卡多一行既有樣式文字，不改評分或資料契約。
- **P3：預報提示假設外部字串唯一。** 證據：`components/WarningsPanel.tsx` 合併 `specialWeatherTips` 與 `warningMessages` 後直接以 message 作 React key；兩個來源出現相同字串時會重複顯示並產生 duplicate-key warning。最小修復是用原生 `Set` 去重並補測試。風險是只移除完全相同的重複提示。
- **P3：兩個零 production caller 的 runtime wrapper。** 證據：全庫引用搜尋顯示 `fetchGovernmentJson` 只在 `lib/api/client.ts` 自我定義；`CompleteFailure` 只由 `tests/ui.test.tsx` 使用，production 已直接使用 `DataFailureState`。最小修復是刪除 alias／wrapper，測試直接 render 真正元件。風險是漏掉字串式或框架 convention 引用；兩者都不是 framework entry，會以全庫搜尋、typecheck 及 build 驗證。

### 執行計劃

- [x] 先加入會在舊實作失敗的 scoring、JSON cleanup、humidity、duplicate message 及背景轉場 regression tests；舊實作的目標測試為 6 failed／181 passed
- [x] 依 P1 → P2 → P3 次序作最小根因修復，不新增 dependency、不改 API／評分正常路徑／視覺設計
- [x] 刪除已確認沒有 production caller 的 runtime alias／wrapper，再次搜尋引用
- [x] 執行 lint、typecheck、完整 unit、coverage、production build、Chromium／WebKit E2E、production PWA E2E、audit、dependency tree 及 diff check
- [x] 複核最終 diff 與原有未提交修改邊界，記錄保留的中低優先級技術債

### 最終驗證

- `npm run lint`、`npm run typecheck`、`npm run build`：全部通過
- `npm test`：21 files、441／441 tests 通過
- `npm run test:coverage`：441／441 tests 通過；statements 91.66%、branches 85.66%、functions 92.23%、lines 94.36%
- `npm run test:e2e`：Chromium／WebKit 合計 56／56 通過
- `npm run test:e2e:pwa`：Chromium 10／10 通過
- `npm audit --json`、`npm audit --omit=dev --json`：0 vulnerabilities；`npm ls --depth=0` 與 `git diff --check` 通過
- 2026-08-14 重驗四個官方 JSON endpoint 及 CSDI nowcast ZIP；ZIP 為單一 17 欄 CSV、3,360 筆資料列，格式與 runtime parser 契約一致

### 保留技術債

- **P2：`app/globals.css` 的 cascade 維護成本。** 單檔約 2,700 行，包含多輪視覺重設 override；本輪搜尋沒有找到可安全刪除的零引用 selector。沒有在缺乏視覺基準的情況重排 cascade，以免製造跨 viewport 回歸；待下一次實質 UI 改版時按元件邊界整理並做 computed-style／截圖 A/B。
- **P2：`components/OutlookApp.tsx` 責任集中。** 約 600 行同時管理請求競態、定位、dialog focus／animation 與頁面編排；現有 race、accessibility 及 E2E 保護完整，現在抽層只會搬動複雜度。待其中一條流程需要獨立演進時才提取 reducer 或 hook。
- **P2：CSP 尚為 Report-Only。** 現有文件已記錄 `unsafe-inline` 與收集方式；本產品沒有使用者文字輸入或 raw HTML，但 enforced nonce／hash CSP 仍是 defense-in-depth 工作，須在真實部署環境先驗證 report。
- **P3：可用但非必要的 dependency 更新。** `axe-core` 4.13.0、Next／`eslint-config-next` 16.3.1，以及 ESLint／TypeScript／`@types/node` 的下一個 major 可用；目前兩種 audit 均為零漏洞，因此留給隔離的 dependency maintenance 批次並重跑完整閘門。
- **P3：真實部署與實機驗收仍屬外部 checkpoint。** 本機 production、Chromium、WebKit 與 PWA 全通過，但 CDN／serverless runtime 及 iPhone／Android 實機行為仍需在部署後驗證。

## 2026-08-10：可部署候選版

- [x] 完整閱讀 `AGENTS.md`、`docs/PRODUCT_SPEC.md`、`docs/API_SOURCES.md`、`docs/ACCEPTANCE_CRITERIA.md` 及 `PLANS.md`
- [x] 唯讀核對 `main` 為 `6575932`、工作樹乾淨、本機落後 13 個 commit，且既有 `origin/main` 為已審查的 `fc20b67`
- [x] 執行 `git fetch --prune origin`；三次暫時性 GitHub 連線失敗後重試成功，抓取後 `origin/main` 仍精確為 `fc20b67`，沒有未審查的新 commit
- [x] 執行 `git merge --ff-only origin/main`，把本機 `main` fast-forward 至 `fc20b67`，沒有 rebase、reset 或歷史改寫
- [x] 以 `npm ci` 兩次成功重建 401 個 packages；npm `11.8.0` 在 Windows 留下 6 個 orphaned optional WASM 目錄，`npm prune` 無動作，逐一路徑及 reparse point 驗證後只清理這 6 個可重建目錄，最終 `npm ls --depth=0` 沒有 missing 或 extraneous dependency
- [x] 修補前 `npm audit` 為 2 High（`js-yaml@4.3.0`、`nanoid@3.3.16`），`npm audit --omit=dev` 為 1 High（`nanoid`）；執行 `npm update nanoid js-yaml --package-lock-only` 後，lockfile diff 只包含 `js-yaml@4.3.1` 與 `nanoid@3.3.18` 的兩個 records
- [x] 修補後重新執行 `npm ci`、`npm audit` 及 `npm audit --omit=dev`；兩種 audit 均為 0 vulnerabilities，沒有剩餘 low、moderate、high 或 critical
- [x] 移除 `README.md` 固定 377 項測試快照，並在 `docs/DEPENDENCY_SECURITY_AUDIT.md`、`docs/QA_REPORT.md` 及本 checklist 記錄本輪已取得的實際結果
- [x] 依序通過 `npm run lint -- --no-cache`、`npm run typecheck`、`npm run test:coverage`（21 files、432／432；statements 91.14%、branches 85.11%、functions 93.79%、lines 93.64%）、`npm run build`、`npm run test:e2e`（52／52 Chromium／WebKit）、`npm run test:e2e:pwa`（10／10）、兩個 high audit、`npm ls --depth=0` 及 `git diff --check`
- [x] 一般 E2E 首輪揭露 WebKit 地區 dialog 的 opening → open 重複 autofocus 競態，以及 21 場景矩陣接近 30 秒總 timeout；拆開初始 focus／focus-trap effects，並只把該矩陣的 test timeout 設為 60 秒後，WebKit 目標重複 6／6、最終完整 E2E 52／52 通過
- [x] 以 production server PID `37964` 在 port 3101 驗證首頁 200、香港整體及沙田 runtime-valid payload、無效地區 400、report-only CSP、API `private, no-store`、五來源 metadata 及降級資料不計分；五來源均為 `ok` 且香港請求只需一次，完成後只終止該 PID，指定測試 ports 與額外 Node process 均無殘留
- [x] 核對最終 Git diff 只包含兩個 dependency lock records、文件，以及品質閘門所需的最小 React／WebKit 測試修正；沒有意外生成檔，亦不改公開 API、評分契約或 CSP；不 commit、不 push、不部署

## 2026-08-02：目前驗證快照（程式 commit `14a0ba8`）

- [x] `npm run lint -- --no-cache`、`npm run typecheck`、`npm test` 及 `npm run build` 通過
- [x] `npm test` 實際輸出為 21 個 Vitest test files、377 項測試；數字只代表 2026-08-02 的 `14a0ba8`，日後以指令輸出為準
- [x] 一般 Playwright E2E 18／18 通過並正常關閉 dev server；PWA E2E 7／7 通過並釋放測試 ports
- [x] 修正 Windows 下 Playwright 內建 `webServer` 完成測試後不退出，改用既有明確 process lifecycle
- [x] 修正 service-worker waiting → activate 交接期間首個 navigation 可被 Chromium abort 的 E2E race
- [x] 確認 runtime 只有 README 列出的三個版本化、非敏感 localStorage key，沒有 runtime sessionStorage
- [x] 分析行尾 warning 為本機 `core.autocrlf=true` 加上 repository 缺少政策；`git add --renormalize --dry-run .` 會觸及 169 個 paths，因此只加入 LF `.gitattributes`，不執行全庫 renormalization
- [ ] Android Chrome 安裝流程、iPhone Safari 分享／加入主畫面及正式 HTTPS deployment 仍需真人實機驗證

## 2026-08-02：42 張響應式天氣背景矩陣

- [x] 建立 7 種場景 × 3 個時段 × 手機／桌面兩種原生構圖，共 42 個唯一 WebP 路徑
- [x] 以同一維港視點生成並逐組檢查天空、天際線、水面、天氣語義及安全文字區
- [x] 擴充 `WeatherPeriod` 為 `day | dusk | night`，以香港座標純函式計算日出、日落及 civil dusk
- [x] 以原生 `<picture>` 及 64rem media query 選擇方向，每個交叉淡入層自行持有圖片
- [x] 移除背景 `background` shorthand，圖片不套 blur，場景色調只由低透明 pseudo-element 疊加
- [x] Weather Scene Preview 覆蓋全部 21 個場景／時段組合
- [x] 靜態測試覆蓋 42 個唯一且存在的路徑；單元測試覆蓋夏至、冬至、一般日期、邊界及無效時間
- [x] 硬性驗收門檻為 42 個唯一 WebP 路徑、原生 16:9／9:16 構圖、文字安全區、場景語義及 responsive 選圖；現有資產與測試已通過
- [x] 可接受限制為 desktop 1659–1660×948、mobile 941×1672；1792×1024／1024×1792 只保留為日後重新生成原生細節時的設計目標，不以插值放大冒充達標
- [x] 完成 390×844、768×1024、1280×720、1920×1080 E2E／視覺驗收及全部品質閘門

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
- [x] Phase 1 驗證：當時基線 lint、test 與 build 通過（歷史紀錄；目前數量見頁首快照）

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
- [x] 執行 `npm test`（當時通過；目前數量見頁首快照）
- [x] 執行 `npm run build`（production build 通過）
- [x] 記錄實際結果與已知限制於 `docs/QA_REPORT.md`

## Post-MVP 修正：載入狀態必定收斂

- [x] 實測目前首頁、8 個 client chunks 與 `/api/outlook` 回應；route 約 0.24 秒回傳，截圖停在 SSR 初始狀態
- [x] 為瀏覽器到內部 route 的請求加入獨立 12 秒 deadline 與可區分的 abort handling
- [x] 確保 timeout、HTTP、格式、網絡及非 cleanup AbortError 都會進入可重試的完整失敗狀態
- [x] 為 JavaScript 未接管頁面的情況提供可操作的整頁重載後備
- [x] 新增 browser route client 8 項回歸測試，且不依賴 live API
- [x] 執行 `npm run lint`、`npm test` 與 `npm run build`；當時全部通過（目前數量見頁首快照）

## 2026-07-16：專案驗收及修復複核

- [x] 重新完整閱讀 `AGENTS.md`、`PLANS.md`、`README.md` 及 `docs/` 全部文件
- [x] 檢查 `package.json` scripts、實作分層、測試案例及 Git 工作目錄；沒有重新初始化、重寫或建立 commit
- [x] 依指定次序執行 `npm run lint`、`npm test`、`npm run build` 及 `npm run typecheck`；當時全部通過（目前數量見頁首快照）
- [x] 以 2026-07-16 真實 HTTP 請求重新探測 HKO `rhrread`、`warnsum`、`flw` 及環保署 AQHI；四個官方 JSON 均成功解析
- [x] 以具外網權限的 production server 端到端呼叫 `/api/outlook?location=hong-kong`；四來源均為 `ok`，證實 runtime 並非使用 fixture／static mock
- [x] 以無外網 production server 實測四來源全失敗；畫面收斂至不顯示分數的完整失敗狀態，並提供重試、HKO 出口及逐來源失敗標示
- [x] 複核 partial failure、missing、malformed、stale、future timestamp、warning unavailable 及 stale 不計分測試
- [x] 搜尋 runtime 原始碼，確認精確位置不傳送／持久化，沒有 sessionStorage、database、analytics 或 API key；目前三個非敏感 localStorage key 已列於 README
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
- [x] 執行 `npm run lint`、`npm run typecheck`、`npm test` 及 `npm run build`；當時全部通過（目前數量見頁首快照）
- [x] 核對最終 Git 差異只包含部署文件，且沒有部署、上傳或建立 commit

## 2026-07-16：首頁 UI／UX 重設計

- [x] 以桌面截圖、產品規格及現有元件完成第一階段設計審核
- [x] 定義「香港天空氣象卡片」資訊架構、responsive wireframe、色彩與字體 tokens
- [x] 實作緊湊位置列、活動模式、決策 Hero、四項因素、警告／預報及來源 accordion
- [x] 保留定位、十八區、資料錯誤、freshness、評分與所有 API 行為
- [x] 以最新 Web Interface Guidelines 審核 UI 並修復重要問題
- [x] 依 Vercel React Best Practices 複核元件、重繪及 bundle 行為
- [x] 驗收 desktop、360px mobile、鍵盤、focus、dark mode 及 reduced motion
- [x] 執行 `npm run lint`、`npm test`、`npm run build`；當時全部通過（目前數量見頁首快照）

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
- [x] 執行 `npm run lint`、`npm test`、`npm run build` 及 `npm run typecheck`；當時全部通過（目前數量見頁首快照）
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

## 2026-08-01：Apple 風格天氣決策介面重構

- [x] 重讀產品規格、API 來源、驗收準則、實作計劃及技術決策
- [x] 以真實請求重驗 HKO 三個 JSON、AQHI 及降雨臨近預報 CSV 格式
- [x] 把 Hero 改為大型結論優先、小型語意圖標及外出指數，保留可存取 progressbar
- [x] 建立緊湊地區 pill、44px 動態圖標按鈕及薄型三模式 segmented control
- [x] 把降雨改為四段真實資料主卡，並把體感、UV、AQHI 收斂成三格摘要
- [x] 把生效警告改為條件式雙格，未確認警告仍顯示審慎提示
- [x] 把預報／提示及來源詳情下移至微型原生 disclosure
- [x] 驗證 320×568、360×800、390×844、416×896、768×1024、1280×720 的首屏層級、雙欄與水平 overflow
- [x] 更新 UI／E2E 回歸測試並執行全部品質閘門
- [x] 完成最終 diff review；不建立 Git commit

## 2026-08-02：背景優先視覺修正

- [x] 把地區與目前活動合併成單一緊湊 pill，其他活動及地區選擇收進同一二級選單
- [x] 移除 Hero 重複狀態列，縮小標題、結論、提示、建議及資料卡文字與間距
- [x] 加入原創香港海港背景的正常／暴雨兩個版本，沿用資料驅動 WeatherScene 動畫
- [x] 更新靜態 UI 與 E2E，覆蓋二級選單及精簡後的 Hero 層級
- [x] 執行 390×844 視覺檢查及完整品質閘門
- [x] 把照片移至穩定 WeatherBackground 基底，場景切換層只保留透明色調
- [x] 降低全頁遮罩、環境光與主要資料卡的不透明度
- [x] 驗證正常／暴雨圖片切換、390×844 首屏及完整品質閘門

## 2026-08-02：Production-readiness audit 與高優先級修正

- [x] 重讀產品規格、API 來源、驗收準則及完整實作計劃
- [x] 執行當時未修改基準的 lint、typecheck、test、coverage 及 production build（目前數量見頁首快照）
- [x] 以真實 Node fetch 及 production `/api/outlook` 驗證五個官方來源，定位全來源失敗為受限 dev server 無法出站
- [x] 按嚴重程度審核功能、型別、API、錯誤、效能、安全、無障礙、responsive、測試、重複／未使用程式碼、dependencies 及 README
- [x] 修正 JSON response byte limit、production dependency advisories、全域安全標頭、內容對比及外部 E2E origin
- [x] 執行修正後 lint、typecheck、test、build、npm audit 及 E2E

## 2026-08-02：降雨臨近預報快取與提示修正

- [x] 讓 nowcast cache 同時受 10 分鐘 soft TTL 及來源更新後 24 分鐘 hard expiry 約束
- [x] refresh 失敗時只沿用仍在 24 分鐘內的已驗證 snapshot
- [x] 區分 stale、failed、malformed 提示，並抑制不影響四段預報的非關鍵全頁警示
- [x] 補齊 cache、fallback、狀態文案及 E2E 回歸測試
- [x] 更新 API／決策文件並執行完整品質閘門

## 2026-08-02：降雨 nowcast 官方壓縮來源修正

- [x] 重現 2.7 MB CSV 在 8 秒 deadline 長期逾時，量度 60 秒只取得約 475 KB
- [x] 驗證同一官方 CSDI dataset 的 16 KB ZIP 及十七欄、四時段資料契約
- [x] 以 Node 內建 zlib 替換 transport，保留壓縮／解壓／列數／deadline 邊界
- [x] 補齊 ZIP、CSDI CSV、cache、損壞及超限回歸測試
- [x] 執行真實本機 route、UI、lint、typecheck、test、build 及最終 diff review

## 2026-08-02：桌面載入版面位移修正

- [x] 量度載入前後 Header 約 11 px 位移，確認與 21 px 垂直捲軸的一半吻合
- [x] 在桌面 viewport 以根元素原生 `scrollbar-gutter: stable` 預留捲軸空間，手機保留完整可用寬度
- [x] 在既有 responsive E2E 加入桌面穩定 scrollbar gutter 及各 viewport 無溢位回歸檢查
- [x] 執行當時 lint、typecheck、test、build、目標 E2E 及最終 diff review；development-only scene preview 不納入 production server 驗收（目前結果見頁首快照）

## 2026-08-02：地區膠囊原地展開選擇介面

- [x] 把活動模式及地區選擇移入同一個地區控制表面
- [x] 以絕對定位覆蓋下方 UI，並在桌面及手機橫跨內容區
- [x] 加入輕微遮罩、再次點擊、遮罩點擊及 Escape 關閉行為
- [x] 保留鍵盤焦點、reduced motion、選擇後收起及既有資料更新行為
- [x] 補充元件／E2E 回歸測試並執行完整品質閘門

## 2026-08-02：靈動島式膠囊形變動畫

- [x] 統一關閉膠囊與展開卡片的外框、背景及陰影元素
- [x] 以四階段狀態及原生 Web Animations API 實作尺寸、圓角與輕微回彈
- [x] 讓選項延遲進場、收起時保留 DOM 至反向動畫完成
- [x] 支援快速反向、Escape／遮罩／完成選擇及 reduced-motion fallback
- [x] 補充動畫中段、反向操作及 reduced-motion E2E 並執行完整品質閘門

## 2026-08-02：定位圖標附近圓角閃爍修正

- [x] 把關閉膠囊與展開面板的外框圓角統一為實際 25px
- [x] 從 Web Animations 尺寸形變移除 `999px → 20px` 圓角插值
- [x] 讓鍵盤焦點環在所有動畫階段都由同一外框持有
- [x] 驗證開啟、收起、快速反向、reduced motion 及完整品質閘門

## 2026-08-02：天氣背景實際效能審查

- [x] 以 production build 及 Playwright 冷快取量測 390×844、430×932、1440×900、1920×1080，確認 responsive `<picture>` 不會交叉下載手機／桌面資產，也沒有 preload 42 張
- [x] 發現首頁先下載 neutral 再下載實際場景；手機為 654,670 transferred bytes，1440 桌面為 611,790 bytes
- [x] 資料 ready 前改用既有深藍純色底，首次載入收斂為目前場景的一張圖片；手機減少 315,306 transferred bytes，1440 桌面減少 303,092 bytes
- [x] 場景切換只新增一張目前 viewport 資產；相同資產再次導覽只需約 300 bytes revalidation，不會重傳完整圖片
- [x] Slow-network 量測中主要內容可先 ready、互動維持 55 ms；背景不阻塞互動，亦不是 CLS 來源
- [x] 圖片失敗時隱藏破圖並保留既有深藍純色 fallback；加入單一首載與失敗 fallback E2E 回歸測試
- [x] 實際檢查手機、1440 及 1920 截圖；1920 約 1.15 倍放大但無肉眼可見模糊，因此不改 WebP quality、像素尺寸或 42 張資產
- [x] 執行 lint、typecheck、377 項 Vitest、production build、6 項效能 audit 及 19 項 production E2E；development-only scene preview 按設計不納入 production server

## 2026-08-02：恢復載入期間的預設背景

- [x] 按產品選擇恢復 loading／safe 狀態的 responsive neutral WebP 及 ready 場景重新掛載
- [x] 保留圖片失敗時的深藍純色 fallback 與破圖隱藏，不修改任何 WebP
- [x] 延遲 mock API 驗證手機及桌面依序顯示 neutral → 實際場景
- [x] Production Playwright 實測 390×844、430×932 均只載入兩張 mobile 圖，合計 654,670 transferred／654,070 resource bytes
- [x] Production Playwright 實測 1440×900 只載入兩張 desktop 圖，合計 611,790 transferred／611,190 resource bytes
- [x] 確認沒有手機／桌面交叉下載，也沒有預載其餘背景矩陣
- [x] 執行 lint、typecheck、377 項 Vitest、production build、3 項恢復量測及 20 項 production E2E；全部通過

## 2026-08-03：消除天氣背景切換時的藍黑色閃屏

- [x] 追查 loading、hydration、ready 與圖片載入的背景切換流程
- [x] 保留同一個 WeatherScene，待新背景載入成功後才交接並淡入
- [x] 新背景載入失敗時保留上一張可用背景
- [x] 執行 lint、typecheck、377 項 Vitest、production build 及目標 E2E

## 2026-08-03：修正 WeatherScene freshness 訊號獨立判斷

- [x] 確認 stale icon、warning availability gate 及缺少 nowcast 輸入是場景錯誤回退的根因
- [x] 讓 fresh warning、storm／rain icon、observed rainfall、當前 nowcast、氣溫及一般 icon 按明確優先序獨立判斷
- [x] 保留評分／安全建議的 freshness 規則、API schema、SSR／PWA／離線及動畫生命週期
- [x] 修正 neutral safe state 的背景失敗回退，不讓離線／不可用畫面保留上一張衍生天氣圖層
- [x] 補充 selector、freshness、場景動態切換、失敗回退、reduced-motion 及 Service Worker 測試
- [x] 實際通過 lint、typecheck、395 項 Vitest、coverage、production build、24 項一般 E2E；新增 SSR→rain 測試及 4 項場景回歸測試亦通過；8 項 PWA E2E 通過

## 2026-08-03：按香港時段顯示 Clear 預設背景

- [x] 首頁改為 dynamic SSR，按香港當刻 period 傳入 OutlookApp；無效時間保守回退 day
- [x] deriveWeatherScene 支援 fallbackPeriod，僅在 null／無效 generatedAt 時採用 SSR period
- [x] semantic neutral 維持中性 DOM、severity、動畫及安全 fallback，圖片映射至同時段 clear mobile／desktop 資產
- [x] 補充 null／無效時間單元測試、neutral clear asset E2E、失敗圖片 fallback 及 viewport 請求驗收
- [x] 通過 lint、typecheck、400 項 Vitest、25 項一般 Playwright E2E、8 項 PWA E2E 及 production build；首頁列為 dynamic route

## 2026-08-04：Production-readiness audit 與高優先級修復

- [x] 閱讀產品、API、驗收及既有計劃文件，盤點 production 程式碼、測試、資產與依賴
- [x] 執行修正前 lint、typecheck、unit、coverage、build、一般 E2E、PWA E2E、dependency audit 及真實官方 API 冒煙測試
- [x] 按嚴重程度列出功能、型別、API、錯誤處理、效能、安全、無障礙、響應式、測試、重複／死碼、依賴及 README 問題
- [x] 修正警告顯示、離線請求競態、錯誤分類、受限儲存下的動態控制及 44px 觸控目標
- [x] 加入最小回歸測試；通過 lint、typecheck、400 項 Vitest、production build、25 項一般 E2E 及 10 項 PWA E2E
- [x] 完成 diff review，記錄未修的中低優先級限制及部署環境診斷

## 2026-08-04：降雨 ZIP 完整性驗證

- [x] 以 central directory 為準，驗證 EOCD、單一 entry、local header 一致性、大小及 CRC-32
- [x] 保留 512 KiB／5 MiB／100,000 行、timeout、cache 及正常 CSV 解析行為
- [x] 補齊 malformed ZIP 回歸測試，通過 lint、typecheck、414 項 Vitest、build、audit 及 HKO live smoke test

## 2026-08-04：氣象數值範圍及高溫缺濕度修正

- [x] 盤點 outlook payload 的外部數值欄位並核對官方即時格式及本地極端紀錄
- [x] 集中保守合理範圍；超界一般天氣欄位按 metric 降級，不 clamp 或拖垮其他觀測
- [x] 一般模式高溫且濕度缺失／異常時，把濕度列入 ignored data，不改完整資料評分
- [x] 補齊範圍、非有限數字、缺失值及高溫濕度回歸測試；lint、typecheck、425 項 Vitest、build、coverage 及 diff check 全部通過

## 2026-08-04：地區選擇浮層 accessibility 與左右 safe-area

- [x] 加入 dialog 語義、初始焦點、焦點圈限、Escape 關閉、焦點恢復及背景 inert
- [x] 讓主內容左右間距納入 safe-area inset，同時保留一般裝置既有視覺比例
- [x] 補充 UI／E2E 回歸測試；通過 lint、typecheck、425 項 Vitest、build、25 項一般 E2E、10 項 PWA E2E 及 diff check

## 2026-08-04：React coverage、accessibility、WebKit 與 timeout 文件

- [x] 把具條件分支的主要 React components 納入 Vitest coverage，補有行為價值的分支測試並保留可維護的既有門檻
- [x] 以 axe 掃描首頁正常、離線、資料不可用及地區浮層，記錄自動掃描限制
- [x] 一般 Playwright E2E 加入 WebKit，CI 安裝所需 browser；PWA 測試按實際 API 支援維持 Chromium
- [x] 修正 README 對 AbortSignal、同步解壓／CSV parsing 及成本上限的描述
- [x] 分批提交並通過 lint、typecheck、430 項 unit／coverage、build、52 項一般 E2E、10 項 PWA E2E、audit 及 diff check

## 2026-08-05：第 7 步 CSS 清理

- [x] 從 `origin/main` 建立隔離 worktree，保留原工作樹的未提交內容
- [x] 盤點 globals.css selector、cascade、media query、component／測試引用及 computed style
- [x] 移除三個零引用舊 selector，並把 `.ignored-data` 合併成單一 authoritative 定義
- [x] 刪除未使用的 `getFailureMessage` export，把 publication-time 純邏輯移出 client component
- [x] 確認未修改 CSP、security headers、API、評分、ZIP parser、dependencies 或視覺設計
- [x] 通過 lint、typecheck、430 項 unit／coverage、build、52 項一般 E2E、10 項 PWA E2E、audit、computed-style A/B 及 diff check
