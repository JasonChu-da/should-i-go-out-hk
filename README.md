# 香港現在適合出門嗎？

手機優先的繁體中文 Next.js 網站，把香港政府的即時天氣、兩小時格點降雨臨近預報、警告、本港預報及空氣質素資料，整理成 0–10 分的可解釋外出建議。

本網站提供一般資訊，不是專業氣象、醫療或緊急安全建議。惡劣天氣時應以香港天文台及政府最新指示為準。

## 功能

- 一般外出、跑步／踩單車、晾衫三種模式，即時以同一組已驗證資料重新計分。
- 瀏覽器定位只在記憶體內轉成最近的十八區 id；精確座標不會送往 server 或永久儲存。
- 拒絕、逾時或不支援定位時，先顯示香港整體結果，再提供十八區一按選擇。
- 顯示天氣與體感、過去一小時雨量、未來最多兩小時的降雨訊號、紫外線、AQHI、生效警告及本港預報。
- 每個來源分別顯示發布／確認時間及本站擷取時間。
- 支援 loading、部分失敗、完全失敗、重試、過時及 malformed 資料狀態。
- 可在 Android／Chrome 安裝成 standalone PWA；iPhone Safari 會提供一次簡短的「加入主畫面」指引。
- 離線時不顯示或保存舊天氣、評分或位置，只提供清楚的離線狀態、最新官方資料時間及重新連線出口。
- 嚴重警告覆蓋一般分數；警告未確認或相關資料不足時限制結論信心。
- 全頁天氣背景只按 fresh 天文台圖示、所選地區即時雨量、結構化警告及香港時間決定；未來降雨不會令背景假裝現在正在下雨，資料不足或過時時使用 neutral 靜態背景。
- 支援 `prefers-reduced-motion` 及「動態背景：開／關」；localStorage 只保存下方列明的非敏感偏好及公開時間 metadata，不儲存位置或天氣 payload。

## 資料流程與架構

```text
瀏覽器位置（只留在記憶體）
  → 十八區 canonical id／香港整體
  → GET /api/outlook?location=...
  → 五個官方來源並行擷取（timeout＋短期記憶體 cache）
  → runtime parsing
  → normalization＋地區／測站選擇
  → 每個量度獨立 freshness 檢查
  → 穩定的 OutlookPayload
  → pure deterministic scoring
  → 手機介面與三模式即時切換
```

主要分層：

- `lib/api/`：官方 endpoint、timeout、HTTP／JSON 檢查、短期 server cache。
- `lib/validation/`：外部 API 與內部 payload 的 runtime validation。
- `lib/normalization/`：資料正規化、繁中展示、缺失／異常／過時狀態。
- `lib/location/`：十八區 mapping、測站選擇、瀏覽器定位降維。
- `lib/freshness.ts`：所有 freshness 門檻。
- `lib/scoring/`：集中門檻及 pure deterministic scoring。
- `lib/outlook/`：五來源聚合、核心／附加來源狀態、failure isolation、scoring input。
- `components/`：手機 UI、模式、地區、資料卡及錯誤狀態。
- `components/weather-scene/`：背景 crossfade、原創 SVG 雲層、Canvas 雨線、readability overlay 及動態控制。
- `lib/weather-scene/`：pure scene derivation、HKO icon mapping 與 scene themes。
- `tests/fixtures/`：經整理的實測 API fixture；自動測試不連 live API。

## 官方資料來源

- [香港天文台即時天氣、警告及本港預報 API 文件](https://www.hko.gov.hk/tc/weatherAPI/doc/files/HKO_Open_Data_API_Documentation_tc.pdf)
- [香港天文台香港網格點降雨臨近預報 dataset](https://data.gov.hk/tc-data/dataset/hk-hko-rss-gridded-rainfall-nowcast-in-hong-kong)
- [香港網格點降雨臨近預報資料字典](https://data.weather.gov.hk/weatherAPI/hko_data/F3/HKO_gridded_rainfall_nowcast_documentation.pdf)
- [環境保護署 AQHI dataset](https://data.gov.hk/en-data/dataset/hk-dpo-datagovhk2-city-dashboard-aqhi)

Freshness 門檻為：即時天氣 90 分鐘、AQHI 3 小時、警告快照 30 分鐘、本港預報 12 小時、降雨臨近預報 24 分鐘。過時值可供辨識，但不會作為環境風險值計分；核心模式資料缺失、異常或過時會限制最高信心分數。降雨臨近預報屬附加資料，單獨失敗不會把現有即時觀測評分標為「資料有限」。

API 實測 schema、可選欄位及時間戳詳見 [`docs/API_OBSERVATIONS.md`](docs/API_OBSERVATIONS.md)，重要取捨詳見 [`docs/DECISIONS.md`](docs/DECISIONS.md)。

## 本機啟動

需求：Node.js 20.9 或以上、npm。[Next.js 官方安裝要求](https://nextjs.org/docs/app/getting-started/installation)亦列明最低 Node.js 20.9。

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。專案不需要 `.env`、API key、帳戶或資料庫。

Service worker 只在 production build 註冊，避免開發時把變動中的 Next.js chunks 留在瀏覽器 cache。要在本機驗證 PWA，先執行 `npm run build`，再使用下方的 production PWA E2E，或執行 `npm run start` 後以 Chromium 開啟 localhost。

## 安裝及離線行為

- Android Chrome：網站符合安裝條件後，可從瀏覽器選單選擇「安裝應用程式」或「加到主畫面」。
- iPhone Safari：點工具列的「分享」，再選「加入主畫面」。已從主畫面以 standalone 模式開啟或已關閉提示時，網站不會重複顯示指引。
- 正式網址必須使用 HTTPS；localhost 只供開發及自動測試。
- Service worker 只離線保存自包含離線頁、版本化品牌圖示及成功的同源 Next.js 靜態資源。導航／SSR HTML、`/api/`、錯誤回應、天氣 payload、地區及定位資料不會寫入 Cache Storage。
- 網絡中斷或資料服務失敗時，所有舊天氣數值、警告、建議、評分及資料驅動背景都會停止 render。重新連線後會實際重抓 `/api/outlook`，只有有效資料返回才恢復結果。
- 每次修改 `public/sw.js`、`public/offline.html` 或 service worker 的 core allowlist，都必須同步遞增 `CACHE_VERSION`，避免 installing worker 改寫 active worker 的 cache。

開發環境另有 `http://localhost:3000/scene-preview`，可人工切換 clear、cloudy、overcast、rain、heavy rain、storm、hot、neutral 及日／夜色調。此 route 在 production 直接回傳 404。

已有 lockfile 的乾淨環境可用 `npm ci` 代替 `npm install`。

### 本機疑難排解

- 正常情況下，資料請求會在 12 秒內顯示結果或可重試錯誤；若頁面仍停在最初的載入卡，使用「重新載入整頁」或按 `Ctrl+F5`，並確認開發伺服器沒有編譯／hydration 錯誤。
- 若四個核心來源全部顯示無法連線，請確認執行 `npm run dev` 的 Node.js process 可以對官方 HKO 及 AQHI endpoint 發出 HTTPS 請求。由受限 sandbox 啟動的開發伺服器可能無法出站；應在一般 PowerShell／Terminal 從本專案目錄啟動。
- 可直接開啟 `http://localhost:3000/api/outlook?location=hong-kong` 檢查內部 route。它應回傳 JSON；即使官方來源失敗，也不應永久 pending。

## 驗證與 production 啟動

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:e2e:pwa
npm run start
```

`npm run test:coverage` 會量測核心業務程式碼並在 `coverage/` 產生 HTML 與 JSON summary；最低門檻定義於 `vitest.config.ts`。Playwright 的 Chromium binary 每個開發環境只需安裝一次，`npm run test:e2e` 會自行在 `http://127.0.0.1:3100` 啟動及關閉 Next.js 開發伺服器。

Vitest 與 Playwright 全部使用本地 fixture／route interception，不依賴政府 API 即時狀態。`npm run start` 需先成功執行 `npm run build`。

測試檔案及案例數以每次 `npm test` 的輸出為準，不作固定驗收門檻。最近一次快照為 2026-08-02、程式 commit `14a0ba8`：21 個 Vitest test files、377 項測試全部通過；之後新增或刪除測試時應以新輸出取代這個快照。

`npm run test:e2e:pwa` 必須在 `npm run build` 之後執行。它以獨立 production server 及本機 proxy 驗證 manifest、安裝條件、service worker headers／生命週期、靜態 cache、真正離線、重新連線，以及同一 `/sw.js` URL 從 v1 更新至 v2 的 waiting／activate 行為。它不使用已 deprecated 的 Lighthouse PWA audit。

正常本機環境直接執行 `npm run test:e2e` 即可，由 Playwright 管理測試 server。若 CI／sandbox 已另行管理 server，可把其 origin 傳入 `PLAYWRIGHT_BASE_URL`，Playwright 便不會重複啟動 server。

### 行尾政策

Repository 以 `.gitattributes` 的 `* text=auto eol=lf` 統一新加入或重新寫入的文字檔為 LF；Git 自動辨識的 binary 不會被當成文字轉換。加入政策前，本機全域 `core.autocrlf=true`，而 repository 沒有 `.gitattributes`，所以 working tree 同時出現 LF、CRLF 及 mixed 檔案，Git 才會顯示「LF will be replaced by CRLF」warning。

本次沒有執行 `git add --renormalize .`，避免把現有大型功能差異混入純行尾 diff。日後只在修改個別檔案時自然套用，或把明確檔案以 `git add --renormalize <path>` 放進獨立、可審核的 hygiene commit。

## Vercel Hobby 免費部署

本專案含動態 `/api/outlook` server route，不能部署成純靜態網站。Vercel 會把該 Route Handler 自動建置成 Node.js Function；不需要 `vercel.json`、資料庫、付費整合、環境變數或 API key。

### 使用免費方案前先確認

- Vercel Hobby 是免費方案，但只適用於個人、非商業用途；限制及免費額度可能改變，部署前請查看 [Hobby 方案](https://vercel.com/docs/plans)、[Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines) 及 [Usage](https://vercel.com/docs/pricing/manage-and-optimize-usage)。
- Vercel 網站以 Git repository 匯入專案。先把專案放到 Vercel 支援的 Git provider，例如 GitHub、GitLab 或 Bitbucket；本步驟不需要把 repository 設為公開。
- Vercel Hobby 可能拒絕作者不是該 Hobby 帳戶擁有者的 Git deployment。準備上傳前，請確保最新 commit 使用 Git provider 能識別的姓名及已驗證電郵／noreply 電郵，不要以 `Local Developer <local-developer@localhost>` 作為準備部署的最新 commit 作者。詳見 [Vercel Git deployments](https://vercel.com/docs/git)。
- 先在本機執行以下部署前檢查，全部通過才上傳：

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

### 在 Vercel 網站建立專案

1. 登入 [Vercel](https://vercel.com/)，並在 team switcher 選擇你的個人 Hobby 帳戶。
2. 在 Dashboard 右上角按 **New Project**（部分介面顯示 **Add New… → Project**）。
3. 如尚未連接 Git provider，按畫面指示連接 GitHub、GitLab 或 Bitbucket，並只授權需要部署的 repository。
4. 在 repository 清單找到本專案，按 **Import**。
5. 在 **Configure Project** 頁面核對：
   - **Project Name**：可保留預設值，或改成容易辨識的名稱。
   - **Framework Preset**：`Next.js`。
   - **Root Directory**：repository 根目錄 `./`；不要選 `.next` 或其他子目錄。
   - **Build Command**：保留 Next.js 自動設定的 `npm run build`，不要啟用 Override。
   - **Output Directory**：保留自動設定，不要填 `.next`。
   - **Install Command**：保留自動偵測；有 `package-lock.json` 時 Vercel 會使用 npm 安裝。
   - **Environment Variables**：保持空白。本專案不需要 secret 或 API key。
6. 按 **Deploy**，等待 build 完成並顯示 **Ready**。Vercel 的 Next.js 自動設定詳見 [Deploying Git Repositories](https://vercel.com/docs/git) 及 [Configuring a Build](https://vercel.com/docs/builds/configure-a-build)。

### 部署後設定與驗證

1. 首次部署完成後，進入 **Project → Settings → Functions → Function Regions**，把唯一 Function region 選為香港 `hkg1`，按 **Save**。Hobby 可選一個 region；把 Function 放近香港政府資料來源可減少網絡延遲。設定後到 **Deployments** 對最新 deployment 按 **Redeploy**，讓新 region 生效。
2. Node.js 可保留 Vercel 預設的最新 LTS。專案要求 Node.js 20.9 或以上，而 Vercel 目前支援 20.x、22.x 及 24.x；如需手動選擇，可在 **Settings → Build and Deployment → Node.js Version** 選擇 24.x。詳見 [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)。
3. 按 deployment 的 **Visit** 開啟正式網址，確認首頁能顯示繁體中文介面，並能在合理時間內由載入狀態轉成結果或可重試錯誤。
4. 直接開啟 `https://你的網域/api/outlook?location=hong-kong`，確認收到 JSON，而不是 404、HTML 錯誤頁或永久載入。
5. 在首頁切換三種活動模式、選擇一個地區及按一次重試，確認 route 與互動均正常。
6. 到 **Deployments → 最新 deployment → Resources／Functions** 找到 `/api/outlook`，確認它是 Node.js Function；如有問題，再查看該 deployment 的 **Runtime Logs**。
7. 到 Dashboard 的 **Usage** 定期查看 Function invocations、Active CPU、Provisioned Memory、資料傳輸及 build 用量，避免超出 Hobby 公平使用範圍。

### Vercel runtime 與快取行為

- `/api/outlook` 是 `force-dynamic`，回應帶有 `private, no-store`，所以瀏覽器及 Vercel CDN 不會保存整份 route 回應。
- PWA service worker 對所有 `/api/` 採 network-only，前端 fetch 亦保持 `cache: "no-store"`；PWA 靜態 cache 不改變 server-side freshness 或 API failure semantics。
- 五個政府來源並行請求，每個來源有獨立 8 秒 timeout；單一來源失敗不會阻塞其他成功來源。降雨 ZIP 的 timeout 覆蓋 response headers、完整 body download、解壓及 CSV 解析。瀏覽器另有 12 秒內部 route deadline，避免永久停留在 loading。
- 成功的上游 JSON 會在同一個 Function instance 記憶體內短暫快取：警告 1 分鐘、即時天氣 5 分鐘、本港預報 10 分鐘、AQHI 15 分鐘。同 URL 的同時請求會合併。降雨 ZIP 每 10 分鐘嘗試更新，cache 只保存十八區共 72 個半小時值及四個全港衍生值，不保存原始檔案。
- 降雨 transport 使用官方約 16 KB ZIP，壓縮後上限為 512 KiB、解壓後上限為 5 MiB，另限制 100,000 筆資料列；超限會取消 reader 及 request。每次 `/api/outlook` 回應只向瀏覽器傳送所選地區或香港整體的四段精簡結果。
- HTTP、網絡、timeout、Content-Type 或 JSON 解碼失敗不會寫入快取。若上游回傳可解碼但 schema malformed 的 JSON，該原始回應可能保留至短期 TTL 屆滿；runtime validation 仍會把相關來源標為不可用，絕不把 malformed 值納入計分。
- 記憶體 cache 不會跨 cold start、重新部署或不同 Function instance 共享，因此只能減少部分重複請求，不能視作可靠的持久 cache。這符合 MVP「無資料庫」限制。
- 新 Vercel 專案預設啟用 Fluid compute；Hobby 的預設 Function duration 足以涵蓋應用本身的 8 秒上游 timeout，毋須額外提高 duration 或購買付費方案。最新上限仍應以 [Vercel Function duration](https://vercel.com/docs/functions/configuring-functions/duration) 為準。

亦可部署到任何支援 Node.js 的平台：執行 `npm ci && npm run build`，再以 `npm run start` 啟動。詳見 [Next.js 官方部署文件](https://nextjs.org/docs/app/getting-started/deploying)。

## 私隱與資料處理

- 沒有登入、帳戶、資料庫、analytics、廣告或使用者文字輸入。
- 精確 latitude／longitude 只在瀏覽器目前頁面的記憶體中使用，立即轉成 district id；server 只收到 canonical id。
- 手動地區選擇只保留在 React state，不寫入 localStorage／sessionStorage。
- Runtime 沒有使用 sessionStorage；localStorage 讀寫在受限儲存模式下失敗時會被安全忽略。
- 所有政府 API 都由 `/api/outlook` server route 存取；失敗結果不會快取。

實際程式碼使用的版本化 localStorage key：

| Key | 保存內容 | 用途 | 敏感資料 |
| --- | --- | --- | --- |
| `weather-scene-motion:v1` | `on`／`off` | 記住動態天氣背景偏好；系統 `prefers-reduced-motion` 仍優先停用動畫 | 否，只是視覺偏好 |
| `pwa-ios-install-hint-dismissed:v1` | 使用者關閉提示後保存字串 `true` | 避免重複顯示 iPhone Safari「加入主畫面」提示 | 否，只是提示狀態 |
| `pwa-last-public-update:v1` | 最新成功 payload 中最新官方 `publishedAt` 的 ISO 時間字串 | 離線頁顯示上次成功取得的公開資料時間；不保存 payload 本身 | 否，只是公開資料時間 metadata |

## 已知限制

- 十八區定位採近似中心點，不是正式區界 polygon；邊界位置可能選到鄰區，使用者可一按改選。
- 香港整體即時雨量採十八區最高有效值，未來降雨逐段採十八區代表格點最高值，AQHI 採全港一般監測站最高有效值；這些是透明、保守的產品聚合規則，不是政府發布的「全港平均」，預設結果可能較悲觀。
- 即時雨量是過去一小時紀錄，不代表此刻仍下雨。未來降雨是約 2 公里格點的臨時自動預報；地形、快速發展／減弱或改變方向的雨區，以及格點內差異都可能造成誤差。
- 四段半小時預報以來源更新時間為起點。頁面會顯示尚餘的實際覆蓋時間；進行中的第一段仍保留完整半小時累計雨量，標示部分時段已過去，不按剩餘時間比例縮放。
- 地區模式使用地區中心最近的預報格點，不是精確地址或區界平均；香港整體模式使用十八區代表格點，不代表香港每個位置都無雨或有雨。
- 強風主要透過結構化天氣警告反映；MVP 沒有加入測風站即時風速。
- 晾衫預報判斷只使用集中、已測試的有限降雨字詞，不會從任意預報文字推斷精確雨量。
- server cache 是每個 process／serverless instance 的短期記憶體 cache；重新啟動或不同 instance 不共享。
- 上游 API 可變更 schema 或暫時中斷；應用會顯示 partial／failure，不會補造數值。
- Headless Chromium 可驗證 manifest、service worker 及 installability 條件，但 Android 安裝對話框與 Mobile Safari 分享選單仍需在部署後以實機 smoke test 確認。
