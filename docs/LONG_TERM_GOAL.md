# 長期目標：把目前工作樹推進至可發布並完成部署驗收

更新日期：2026-08-12
專案根目錄：`D:\should-i-go-out-hk`

## 總目標與停止條件

在不改變 MVP 產品範圍的前提下，完整審查目前的 CSDI 17 欄單向切換，修正已確認問題，通過全部品質與安全閘門，驗證本機 production 與五個官方即時資料來源，同步文件，對 CSP 作出有證據的決定，並完成已授權的 Vercel 部署及可取得證據的裝置驗收。

只有以下條件同時成立，才可宣告目標完成：

- 七個 checkpoint 均達到各自的完成條件。
- 所有自動檢查最後一次執行均通過，且結果已記錄。
- 正式部署及 Android／iPhone 實機項目有真實證據，不得以模擬代替。
- 若缺少 Vercel 授權、正確專案連線或實機，先完成其餘工作，再把目標標為受阻並列出唯一所需的使用者動作，不得誤報完成。

## 已確認基線（開始後仍須重新驗證）

- Branch：`main`，追蹤 `origin/main`，目前 ahead 1。
- 工作樹已有 11 個未暫存檔案，合計約 230 insertions／188 deletions，內容集中於 CSDI 17 欄 parser、fixture、測試及文件。
- 不得用 reset、checkout、clean、rebase 或覆寫方式丟棄這些既有修改。
- 專案為 Next.js 16、React 19、TypeScript strict 的 mobile-first PWA；沒有帳戶、資料庫、API key 或付費服務。
- 本文件記錄的是工作範圍，不是最新通過證據；所有結果以目標執行期間的實際輸出為準。

## 工作邊界

- 開始前完整閱讀 `AGENTS.md`、本文件、`docs/PRODUCT_SPEC.md`、`docs/API_SOURCES.md`、`docs/ACCEPTANCE_CRITERIA.md`、`PLANS.md` 及相關 README／決策文件。
- 可在此專案內作最小必要的程式碼、測試與文件修改；先找根因並沿用現有架構，不新增 speculative abstraction、feature flag 或相容層。
- 不新增大型 production dependency；不得加入付費服務、AI API、帳戶、資料庫、分析、廣告或精確位置儲存。
- 自動測試只用本地 fixture／route interception；真實政府 API 只用於獨立 smoke test。
- 不建立 Git commit、不 push、不改寫歷史，除非使用者另行明確要求。
- 每完成一個 checkpoint，在本文件下方的進度紀錄寫入日期、修改摘要、指令、結果及剩餘限制；失敗不得改寫成通過。

## Checkpoint 1：CSDI 17 欄 release review

- [x] 保存並審查目前全部 Git diff，追蹤 nowcast 從 HTTP／ZIP transport、CSV validation、snapshot、cache、aggregation、payload、scoring 到 UI 的完整呼叫鏈。
- [x] 以唯讀真實請求重新核對官方 ZIP entry、Content-Type、17 個唯一欄名、時區、四個連續時段及文件差異。
- [x] 驗證 parser 對欄位順序可變，但對缺欄、額外欄、重複欄、錯誤 row width、非法時間／座標／雨量維持正確嚴格度。
- [x] 驗證 compressed／decompressed size、row count、deadline、CRC、freshness hard expiry、fresh-if-error cache 及 stale 不計分規則沒有退化。
- [x] 核對 sanitized fixture provenance、測試資料與 README／API observations／decisions 一致。
- [x] 只修正可重現的正確性、安全性或文件問題；每個非平凡修正須有最小回歸測試。

完成條件：沒有未處理的高優先級 release blocker；目標測試與 `git diff --check` 通過；審查結論有檔案／行為證據。

## Checkpoint 2：完整品質與依賴閘門

依序執行並保存實際輸出：

- [x] `npm run lint -- --no-cache`
- [x] `npm run typecheck`
- [x] `npm run test:coverage`（已包含完整 Vitest suite，不重複執行同一套測試）
- [x] `npm run build`
- [x] `npm run test:e2e`
- [x] `npm run test:e2e:pwa`（必須在成功 build 後）
- [x] `npm audit --audit-level=high`
- [x] `npm audit --omit=dev --audit-level=high`
- [x] `npm ls --depth=0`
- [x] `git diff --check`

若其後再修改程式，先跑最小相關檢查，最後重新跑受影響的完整閘門。不得藉修改測試門檻、跳過案例或放寬 validation 令檢查變綠。

完成條件：所有指令 exit 0；記錄 test file／case 數、coverage、E2E browser／case 數、build routes 及 audit 結果。

## Checkpoint 3：本機 production 與官方 API smoke test

- [x] 從最新 build 在未佔用 port 啟動 production server，記錄 PID；結束時只終止該 PID並確認沒有殘留 listener。
- [x] 驗證首頁 200、繁體中文介面、manifest、Service Worker 及主要靜態資源可取得。
- [x] 驗證香港整體與十八區 `/api/outlook` payload 均通過 runtime schema；非法 location 回傳預期 4xx。
- [x] 真實驗證 current weather、warning、forecast、AQHI、gridded rainfall nowcast 五個官方來源的 metadata、發布／擷取時間、freshness 與失敗隔離。
- [x] 驗證 stale／malformed／failed 資料不參與計分，warning unavailable 不會被描述為安全。
- [x] 驗證 API `private, no-store`、既有安全 headers 與 CSP header；記錄合理的 response time 及任何上游限制。

完成條件：正常與降級行為符合 product spec；所有 live 結論附當次時間與回應證據，且沒有把即時 API 納入自動測試。

## Checkpoint 4：文件一致性與低成本債務清理

- [x] 對照實作及實際指令，核對 README、API sources／observations、decisions、acceptance criteria、QA report 與 PLANS。
- [x] 修正目前式文件的矛盾、過時指令、錯誤狀態或 superseded nowcast／cache 描述；歷史紀錄保留原貌，必要時清楚標記已被後續證據取代。
- [x] 文件明確區分「程式碼確認」、「本輪執行證據」與「推測／外部待驗證」。
- [x] 更新本輪品質、live smoke、部署及裝置驗收結果，不保存會迅速失真的固定測試數字作永久門檻。

完成條件：README 可由新開發者照做；目前式文件與程式沒有已知實質矛盾；歷史證據沒有被重寫成新證據。

## Checkpoint 5：CSP 稽核與有證據的處置

- [x] 重新核對 production 全 route 的 Report-Only policy、既有 security headers、Chromium／WebKit console 及 `securitypolicyviolation`。
- [x] 核對 script、style、image、font、connect、worker、manifest、frame、object、form、media 的實際資源矩陣，不因開發工具或 server-side government fetch 放寬 production policy。
- [x] 若能以最小、安全、可測方式移除阻礙並切換 enforcing CSP，實作後跑完整 CSP／E2E／build 回歸。
- [x] 若 Next.js inline hydration／style 仍令 enforcing 需要 nonce、全面 dynamic rendering 或明顯架構／效能取捨，保留 Report-Only，記錄證據與獨立後續方案；不得為了勾選項目而部署會破壞頁面的 CSP。
- [x] 不建立無實際監控用途、會收集資料或消耗免費額度的 reporting backend。

完成條件：CSP 決策有 production 證據。此 checkpoint 的成功是「安全處置正確」，不等同必須強制啟用 CSP。

## Checkpoint 6：Vercel preview／production 部署與驗收

- [ ] 先確認 Vercel 帳戶、team、project、repository 與 `D:\should-i-go-out-hk` 完全一致；只使用已授權的 Vercel connector／CLI。
- [ ] 若尚未安裝或授權 Vercel，先完成其他 checkpoint，再要求使用者安裝／授權；不得部署到猜測的帳戶或專案。
- [ ] 先部署 preview，檢查 build／runtime logs、Node runtime、動態 `/api/outlook` 及既有設定；通過後才部署 production。
- [ ] 在可用且符合方案的情況下確認 Function region 為香港 `hkg1`，並以 redeploy 後的實際 runtime 為證。
- [ ] 在正式 HTTPS URL 重跑首頁、香港整體、至少一個地區、非法 location、五來源 metadata、freshness／降級、安全 headers、manifest、Service Worker 及 PWA 基本 smoke test。
- [ ] 不建立 commit／push；若所選部署流程必須先 commit 或連接 Git，先取得使用者明確授權。

完成條件：preview 與 production 均為 Ready，正式 URL 及部署後驗收證據已記錄；若缺少外部授權則本 checkpoint 保持受阻，不能標記完成。

## Checkpoint 7：瀏覽器、無障礙與實機驗收

- [x] 以 Chromium 與 WebKit 驗證主要流程、地區 dialog、三種活動模式、retry、partial／complete failure、鍵盤 focus、reduced motion 及無水平 overflow。
- [x] 用 axe 及人工鍵盤流程檢查正常、資料有限、不可用、dialog 與 PWA／offline 狀態。
- [x] 獨立驗證 dark mode 的可讀性、對比、背景、focus、status 及主要 viewport；模擬結果只標為 browser 測試。
- [ ] 在 Android Chrome 實機驗證安裝提示、加入主畫面、standalone 啟動、更新／離線／重連及 safe-area。
- [ ] 在 iPhone Safari 實機驗證分享選單、「加入主畫面」、standalone 啟動、更新／離線／重連及 safe-area。
- [ ] 實機證據記錄裝置／OS／browser 版本、正式 URL、結果及截圖或可核對紀錄；不得把 Playwright viewport、device emulation 或 headless browser 稱為實機。

完成條件：所有可自動化項目通過；Android 與 iPhone 均有真實驗收證據。沒有可用實機時，本 checkpoint 保持受阻並提供最短人工 checklist。

## 最終交付

完成或受阻時，提供：

1. 實作／修正內容及根因。
2. 所有變更檔案。
3. 執行指令及精確結果。
4. 七個 checkpoint 的完成／受阻狀態與證據。
5. 部署 URL、版本及 live smoke 結果（若已授權完成）。
6. 已知限制與仍需使用者完成的唯一動作。
7. 建議 Git commit message；除非另有明確要求，不建立 commit。

## 進度紀錄

- 2026-08-12：建立目標；尚未在本文件執行任何 checkpoint。
- 2026-08-12 20:04 HKT：Checkpoint 1 完成。開始時重新確認 `main`／HEAD `7ff83a58a5a55e39843bb98fab3fa608ed6f3612`、本機 `origin/main` `fc20b671c69034fb57bb8b2f4c39ce3c703939f9`、ahead 1、11 個 tracked 修改（230 insertions／188 deletions）及本文件為 untracked；原始 binary diff 與本文件副本已保存至 task 專屬 `baseline/` 證據目錄，SHA-256 分別為 `965DAD5DBE9B680737CC4F596FAB1B566EAA2AF4056D720BE1FE421592D0C7DD`、`EDEC2918D1E362A8A0F70855E6FFB91C4CB6583BDF263F4475300658A3EF644E`。唯讀 `git fetch --prune origin` 經核准重試後仍因 GitHub 443 連線失敗，故沒有把本機 remote-tracking ref 冒充本輪已刷新證據；branch、HEAD 與工作樹未被改寫。
- 2026-08-12 20:04 HKT：本輪唯讀官方 CSDI ZIP 於 19:42:59 HKT 回傳 HTTP 200、`application/zip`、11,939 bytes；只有 `gridded_rainfall_nowcast.csv`，壓縮／解壓大小為 11,733／222,837 bytes、CRC-32 `1936211052`、17 個唯一欄名、3,360 列、唯一更新時間 `202608121924`、`UTC+8`，結束時間為 `19:54`、`20:24`、`20:54`、`21:24`。官方 2022 單頁 PDF 經全文抽取及整頁 render 核對後仍只描述歷史五欄 CSV；現行 runtime 契約以同一官方 CSDI dataset 的當次 ZIP 實際回應為準，舊格式只保留為歷史文件與拒絕測試。
- 2026-08-12 20:04 HKT：完整追蹤 `fetchRainfallNowcast` → ZIP validation／CRC／deadline → 17 欄 parser → compact snapshot／fresh-if-error cache → aggregate → browser payload validator → scoring input → pure scoring → UI。修正共用 trust boundary 的三個可重現問題：空白／十六進位等非十進位 CSV 數值可被 `Number()` 接受；多值 `Content-Type` 可因其中一項合法而放行；HTTP／格式／大小早退會等待無界 body cleanup 或留下無用串流。現在只接受有限十進位、單一 allowlisted media type，拒絕或超限時發出 cancel 並立即 abort 而不等待 cleanup。補上非法數值、多值 Content-Type、HTTP／格式 body cancellation、卡住 cleanup 及 100,001 列（CSV／ZIP 均未觸及大小上限）回歸測試；同步把 D-025 標為歷史並修正 D-034 的 supersession 交叉引用。
- 2026-08-12 20:04 HKT：Checkpoint 1 最終證據為 `npm test -- tests/rainfall-nowcast.test.ts tests/rainfall-nowcast-client.test.ts tests/aggregate.test.ts` 3 files、54／54 tests 通過，`npm run typecheck` exit 0，`git diff --check` exit 0。既有測試另直接覆蓋 512 KiB 壓縮、5 MiB 解壓、CRC、8 秒 deadline、24 分鐘 hard expiry、fresh-if-error 只沿用 fresh snapshot、stale normalization 及 downstream 不計分；未發現其他高優先級 release blocker。
- 2026-08-12 20:11 HKT：Checkpoint 2 完成。依文件順序執行 `npm run lint -- --no-cache`、`npm run typecheck`、`npm run test:coverage`、`npm run build`、`npm run test:e2e`、`npm run test:e2e:pwa`、兩個 high audit、`npm ls --depth=0`、`git diff --check`，全部 exit 0；沒有重複另跑已包含在 coverage suite 的完整 Vitest。
- 2026-08-12 20:11 HKT：本輪 coverage 為 21 files、437／437 tests；statements 91.75%（1647／1795）、branches 85.62%（1382／1614）、functions 93.15%（286／307）、lines 94.29%（1554／1648）。Next.js 16.2.12 production build 成功，routes 為 dynamic `/`、dynamic `/api/outlook`、static `/_not-found`、`/manifest.webmanifest`、`/scene-preview`。一般 E2E 為 Chromium 26＋WebKit 26，共 52／52、無 retry；成功 build 後的 production PWA E2E 為 Chromium 10／10。兩個 `npm audit` 均為 `found 0 vulnerabilities`；`npm ls --depth=0` 沒有 missing／extraneous，列出 16 個 direct dependencies；測試結束後 3100、3200、3201 均無 listener。
- 2026-08-12 20:31 HKT：Checkpoint 3 完成。以最新 build 在 `127.0.0.1:3101` 啟動 production server（PID 17416），並於 20:25:48 HKT 以專案現有 runtime validator／scoring 實作完成一次性 smoke。完整 JSON 證據保存於 task 專屬 `checkpoint-3-smoke.json`（23,534 bytes，SHA-256 `D347DBCD3BAA88BC14171237271EDDC482F340E3A43105001625CE0451B68AFC`）。首頁 200、`lang=zh-Hant-HK`、繁體中文內容可辨識；manifest、Service Worker、offline fallback 及從首頁發現的 12 個 Next 靜態資源全部 200，production 的開發專用 `/scene-preview` 正確為 404。
- 2026-08-12 20:31 HKT：香港整體與十八區共 19／19 個 `/api/outlook` 回應均為 200，通過實際 `isOutlookPayload`、location／source 一致性及各活動結果狀態檢查；非法 location 為 400、`no-store` 及預期繁體中文錯誤。首次首頁請求 607 ms；快取已暖後的 19 個 API 回應為 1.4–2.6 ms。本輪五個官方來源皆為 `ok`、無 issue：weather 發布 20:00、warning 18:30、forecast 19:45、AQHI 19:30、nowcast 20:12 HKT；共同擷取約 20:24:56 HKT。這些是本輪即時回應，不是自動測試 fixture；本輪沒有發生真實上游失敗。
- 2026-08-12 20:31 HKT：另只在記憶體複製當次 live payload，分別注入 stale／malformed／failed 狀態，驗證三種活動均沒有任何不可用 evidence value 洩漏進計分，結果為 unavailable／limited；只令 warning failed 時，總分受限且文案明示「未能確認」，不會描述為安全。這是受控降級驗證，不冒充真實 API 故障。API header 為 `private, no-store, max-age=0`，Report-Only CSP 與既有 nosniff、DENY、referrer／permissions policy 均存在，沒有 enforcing CSP。結束後只關閉已核對為本輪 `D:\NODE\node.exe` 的 PID 17416；3101 listener 為 0。唯一觀察到的環境限制是 GitHub 443 無法刷新 remote，政府資料來源本輪均可達。
- 2026-08-12 20:43 HKT：Checkpoint 4 完成。逐份對照 README、API sources／observations、decisions、acceptance criteria、QA report、dependency audit、PLANS 與實作。修正目前式文件仍稱本輪未做 live smoke、Vercel 必須先經 Git、transport failure／malformed cache 混稱、nowcast Content-Type 多值語義不清等問題；Acceptance／QA 明確把「程式與 fixture」、「2026-08-12 本機 production live 證據」、「正式 HTTPS／實機待驗」分開。2026-07-30 五欄／無 fresh-if-error 的 QA 內容保留原文並標為歷史，D-025 及 D-034／D-033 的取代關係維持可追溯。
- 2026-08-12 20:43 HKT：同日以 Vercel 官方現行文件核對：CLI 可從本機 root 先部署 preview、再部署 production而毋須先 commit／push；新 Function 預設 `iad1`，香港 region 是 `hkg1` 且需設定後以實際 deployment 證據確認；可用 Node.js 為 24.x（預設）、22.x、20.x；Hobby 限個人非商業用途。README 因此提供 Git／CLI 兩條路徑，但沒有在帳戶／team／project 尚未核對前加入 `vercel.json` 或聲稱設定已生效。`git diff --check` exit 0；本 checkpoint 只改文件，沒有把 437／52／10 等本輪快照改成永久驗收門檻。
- 2026-08-12 20:50 HKT：Checkpoint 5 完成。最新 production build 在 port 3301 以 PID 72936 重驗；task 證據 `checkpoint-5-csp.json` 為 76,670 bytes、SHA-256 `BE56CFDF9E7506A6C55EF7EB823022ED6CC38EC7EDFE8A9D3B03211C0FB02157`。9 類 route 及 46 個靜態資產的 Report-Only policy 全部一致、沒有 enforcing CSP，46／46 靜態資產 200；既有 nosniff、DENY、referrer 及 permissions headers 亦存在。Chromium／WebKit 實走 live 首頁、沙田、晾衫、動態開關及 offline page，所有 browser 資源均為同源，兩者都是 0 個 `securitypolicyviolation`、0 page error、0 request failure；WebKit 唯一 console error 是無 `report-to` 時政策不生效的固定提示，沒有被算成網站資源違規。
- 2026-08-12 20:50 HKT：資源矩陣實際只有 document、10 個同源 script bundle、1 個 stylesheet、同源背景 image、RSC／`/api/outlook` connect、manifest 及 `/sw.js`；沒有 font、frame、object、form、media 或 browser-side 政府來源。首頁有 5 個 inline hydration script、互動前 16／互動後 17 個 style attributes；offline page 另有 1 個 inline script＋1 個 inline style。只在本機 response interception 移除兩個 `unsafe-inline` 並改成 enforcing 的假設探針，Chromium／WebKit 各產生 21 個 enforced violation（5 `script-src-elem`＋16 `style-src-attr`）且主畫面停在 loading。因此依完成條件保留 Report-Only，不放寬 source、不建立 reporting backend；後續 enforcing 必須獨立處理 nonce／hash、React 動態 style 及 rendering／cache 取捨。PID 72936 已精確關閉，3301 listener 為 0。
- 2026-08-12 20:52 HKT：Checkpoint 6 外部受阻，未標完成。以專案 `D:\should-i-go-out-hk` 為限定條件搜尋全部可用 connector／工具，沒有 Vercel 能力；`Get-Command vercel`、project-local bin 及 global npm tree 均沒有 Vercel CLI；`.vercel/`／`.vercel/project.json` 不存在；程序環境沒有任何 `VERCEL*` 變數名稱。`.gitignore` 已排除 `/.vercel`，Git remote 是 `https://github.com/JasonChu-da/should-i-go-out-hk.git`，但 remote 不能證明 Vercel 帳戶、team、project 或授權。故沒有執行 login、link、建立專案、preview／production deployment、region 變更或 HTTPS smoke，也沒有安裝新工具；先繼續所有不受阻 checkpoint。完成此 checkpoint 需要使用者提供已授權且可核對 scope／project 的 Vercel connector 或 CLI session。
- 2026-08-12 21:18 HKT：Checkpoint 7 的所有可自動化項目完成，但 Android／iPhone 實機項目外部受阻，故 checkpoint 未標完成。現有一般 E2E 已覆蓋 Chromium／WebKit 的主要流程、三活動模式、retry、partial／complete failure、dialog、焦點、reduced motion 及 overflow；另補 warning unavailable 的 axe 掃描與固定 dark theme assertion。本輪目標測試先得 4／4 通過，最終完整 E2E 數量以本輪終局品質閘門為準。
- 2026-08-12 21:18 HKT：以最新 production build 在本機 live 資料執行獨立 browser 證據；`checkpoint-7-browser.json` 為 3,949 bytes、SHA-256 `C2327AA15AD93A9D433F6D54121D4CAC440D2A14FE733792B1CAB55D12ECF9B3`。Chromium／WebKit 的 normal、dialog、offline 三種 axe 掃描均為 0 violations；兩者都是焦點還原成功、`prefers-reduced-motion` 後 `data-motion=off`、390×844 與 1280×720 無水平 overflow、0 page error、0 request failure。Chromium 只記錄 Playwright 阻止 Service Worker 的預期 warning；WebKit 只記錄無 `report-to` 的既知 Report-Only CSP 提示。手機主頁、完整 dialog 及 desktop 截圖已實際檢視，沒有裁切、遮擋或低對比問題；此為 browser／viewport 證據，並非實機。
- 2026-08-12 21:18 HKT：另在可見 in-app browser 對本機 production 執行人工鍵盤操作：dialog 開啟後焦點在已選「香港整體」，Tab／Shift+Tab 保持在 dialog 內，Escape 關閉後焦點返回地區按鈕。`adb`、`idevice_id`、`ideviceinfo`、`ios-deploy` 均不存在，Windows present PnP 清單亦沒有 Android／iPhone／iPad／Apple Mobile／ADB 候選裝置，故沒有虛構裝置、OS、browser、正式 URL 或安裝結果。最短實機 checklist：在 Android Chrome 及 iPhone Safari 分別開啟同一正式 HTTPS URL → 記錄裝置／OS／browser 版本 → 加入主畫面並 standalone 啟動 → 驗證更新、離線、重連與直／橫向 safe-area → 各保存一張可核對截圖。兩個臨時 production server 均已關閉，ports 3401／3402 無 listener。
- 2026-08-12 21:25 HKT：所有不受外部條件限制的工作完成。修改後重新依序執行 `npm run lint -- --no-cache`、`npm run typecheck`、`npm run test:coverage`、`npm run build`、`npm run test:e2e`、`npm run test:e2e:pwa`、`npm test`、兩個 high audit、`npm ls --depth=0` 及 `git diff --check`，全部 exit 0。實際結果為 21 files／437／437 Vitest；coverage statements 91.75%（1647／1795）、branches 85.62%（1382／1614）、functions 93.15%（286／307）、lines 94.29%（1554／1648）；Chromium 27＋WebKit 27 共 54／54 一般 E2E、Chromium 10／10 production PWA E2E；兩個 audit 均 0 vulnerabilities，16 個 direct dependencies 無 missing／extraneous。3100、3101、3200、3201、3301、3401、3402 全部無 listener；終局程序核對另發現本輪 3401 的無監聽 npm／Next wrappers（PID 72088／75028），逐一驗證 command line 後只停止這兩個 PID，未碰觸 in-app Browser runtime。Git 仍在 `main`、HEAD 未變 `7ff83a58a5a55e39843bb98fab3fa608ed6f3612`，沒有 commit、push、reset、checkout、clean 或歷史改寫。
- 2026-08-12 21:25 HKT：Checkpoint 1–5 完成；Checkpoint 6 只因缺少可核對的已授權 Vercel scope／project 而受阻；Checkpoint 7 的 browser／無障礙／鍵盤／dark mode 部分完成，只因沒有 Android Chrome 與 iPhone Safari 實機及正式 URL 而受阻。唯一需要使用者完成的下一步是提供一次有界限的聯合驗收時段：在本專案可使用已登入且已核對 scope／project 的 Vercel connector／CLI，並讓一部 Android Chrome 與一部 iPhone Safari 實機可用；之後即可依序完成 preview、production、`hkg1`、正式 HTTPS smoke 與上述兩部實機 checklist。
- 2026-08-12 21:35 HKT：自動續行第二次外部阻塞稽核，未沿用前輪假設。Git 仍為 `main`／HEAD `7ff83a58a5a55e39843bb98fab3fa608ed6f3612`，原始兩份備份 SHA-256 仍分別為 `965DAD5DBE9B680737CC4F596FAB1B566EAA2AF4056D720BE1FE421592D0C7DD`、`EDEC2918D1E362A8A0F70855E6FFB91C4CB6583BDF263F4475300658A3EF644E`，三份 checkpoint JSON 證據檔亦仍存在；`git diff --check` 通過。全部可用工具再次搜尋仍沒有 Vercel 能力，系統／project-local／global 均無 Vercel CLI，`.vercel/`、`.vercel/project.json`、`vercel.json` 及 `VERCEL*` environment names 均不存在，因此仍無法核對帳戶、team、project 或授權。`adb`、`idevice_id`、`ideviceinfo`、`ios-deploy` 均不存在，present PnP 候選 Android／Apple mobile device 為 0；全部專案／測試 ports 無 listener。逐項重讀未勾選清單後，Checkpoint 6 的 6 項全依賴已授權 Vercel，Checkpoint 7 剩餘 3 項全依賴正式 URL 與兩部實機，沒有其他可自行推進的本機工作。
- 2026-08-12 21:38 HKT：自動續行第三次連續外部阻塞稽核。重新搜尋可用工具仍為 0 個 Vercel connector；`vercel` command、project-local binary、`.vercel/project.json`、`vercel.json` 與 `VERCEL*` environment names 仍全部不存在，global npm tree 明確為 `(empty)`。`adb`、`idevice_id`、`ideviceinfo`、`ios-deploy` 仍全部不存在，present PnP 候選手機裝置仍為 0。Git 仍在 `main`／同一 HEAD，`git diff --check` exit 0，全部專案／測試 ports listener count 為 0。相同阻塞已在原始執行及兩次自動續行共三個連續 goal turns 重現，且所有非外部工作已完成；依目標的阻塞規則正式標記 goal 為 blocked。唯一解除條件不變：提供已授權且可核對 scope／project 的 Vercel session，並讓一部 Android Chrome 與一部 iPhone Safari 實機可用。
