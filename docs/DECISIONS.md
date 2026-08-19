# 技術決策紀錄

更新日期：2026-08-17

## D-001：使用單一聚合 server route

採用 `/api/outlook?location=<canonical-id>`，由伺服器並行擷取及正規化五個官方來源。瀏覽器不直接依賴政府 schema，只接收穩定的內部資料格式；大型降雨 CSV 亦只回傳所選位置的四段精簡結果。

理由：可隔離個別 API 失敗、集中 timeout／cache／validation／freshness，亦減少手機端請求次數。

## D-002：精確位置只留在瀏覽器記憶體

瀏覽器取得 latitude／longitude 後，使用本地靜態十八區中心點選出最近地區，只把 canonical district id 傳到 `/api/outlook`。不寫入 storage、analytics、database 或伺服器 log 的應用資料。

理由：滿足「目前 session 內使用」及資料最小化；MVP 不需要地圖或地址反向編碼服務。區界附近可能分配到相鄰區，UI 會允許一鍵改選。

## D-003：不用大型 runtime schema dependency

以小型 TypeScript type guards／parsers 驗證 `unknown`，回傳「可用部分資料＋issues」。未知額外欄位不令整個來源失效，錯誤型別的個別項目會被排除。

理由：官方回應小而有限，手寫 parser 可明確容忍 HKO 的空字串 union 與 AQHI 型別差異，並避免增加非必要 production dependency。

## D-004：自管短期 server memory cache

API client 使用模組內 TTL cache，保存已驗證前的 JSON、實際 `retrievedAt` 與到期時間；upstream fetch 設 `cache: no-store`。TTL：警告 60 秒、即時天氣 5 分鐘、預報 10 分鐘、AQHI 15 分鐘。大型降雨 CSV 使用獨立串流 client，成功解析後只 cache 十八區 72 個值及四個香港整體衍生值 10 分鐘，不保存原始 CSV。

理由：HKO 實測沒有 cache validators；自管 cache 能保留真實擷取時間並降低重複請求。Serverless instance 重啟會失去 cache，屬可接受的 MVP 限制。

## D-005：freshness 使用最貼近資料語義的時間

- 氣溫、濕度、雨量分別使用各自 `recordTime`／`endTime`。
- UV 沒有結構化觀測時間時使用 `rhrread.updateTime`。
- AQHI 無 offset 的 `publish_date` 明確按香港時間 `+08:00` 解析。
- 地區預報使用 `flw.updateTime`。
- `warnsum` 是「目前生效警告快照」，以成功擷取 `retrievedAt` 套用 30 分鐘 freshness；每項 `updateTime` 只作顯示。

理由：2026-07-14 實測中仍生效的強烈季候風信號已約兩小時沒有更新。若以 issue/update time 套 30 分鐘門檻，會錯誤忽略仍生效的警告。

## D-006：香港整體模式採明確、保守而非虛構平均值

- 氣溫使用「香港天文台」站。
- 雨量使用十八區有效資料的最高值，標示為「十八區最高」。
- 未來降雨逐時段使用十八區代表格點最高值，文案限定為「香港部分地區」或「十八區代表格點」。
- AQHI 使用所有 fresh 一般監測站的最高值，標示為「全港一般站最高」。
- 不把三個路邊 AQHI 站混入一般使用者結果。

理由：資料源沒有官方「全港平均」觀測值；安全產品不應虛構平均數。最高值是產品的保守聚合決定，並非政府指定算法，必須清楚標示。

## D-007：警告不可由其他來源推斷

嚴重警告只使用結構化 `warnsum`。`rhrread.warningMessage` 只作輔助顯示。`warnsum` 成功回傳 `{}` 代表已確認無生效警告；請求或 parser 失敗則是 `unavailable`，兩者不可混同。

理由：規格明確禁止在警告 API 失敗時推斷安全。

## D-008：missing 與 stale 不扣虛構分，但會限制信心

只有 fresh、validated observations 可產生環境扣分。stale／missing 不會以舊值或零值產生環境扣分；只要所選模式的核心相關資料缺失、異常或過時，信心上限為 7，必定落在「可以出門，但需要準備」。警告未確認亦有相同上限。若所選模式完全沒有 fresh 相關觀測或生效警告，則回傳 `score: null`，而不是從 10 分開始。四個核心來源全失敗時不顯示分數，即使附加 nowcast 成功亦不例外。Nowcast 單獨失敗不限制現有分數，只以獨立 banner 說明。

理由：同時滿足「過時資料不影響分數」與「缺失資料不可當作安全」。

## D-009：預報文字只採集中、可測試的有限規則

本港預報主要作支援文字。晾衫模式只會針對集中定義且有測試的明確降雨語句（例如「驟雨」、「雷暴」、「大雨」）加入扣分；不從任意文字推斷精確雨量或其他氣象狀態。

理由：產品規格要求晾衫考慮驟雨描述，同時禁止脆弱、未測試的任意關鍵字判斷。

## D-010：標準 Next.js App Router 專案

使用 Next.js App Router、React、TypeScript strict、原生 CSS 與 Vitest；不加入 UI framework、資料庫、analytics、AI 或第三方天氣套件。

理由：符合 source of truth，保留免費平台可部署性，並把 production dependencies 維持最小。

## D-011：嚴重警告覆蓋範圍

`WRAINB`、`TC8NE/SE/NW/SW`、`TC9`、`TC10` 及 `WTMW` 把三個模式的分數上限設為 1。紅雨、黃雨、雷暴、三號風球及其他已知警告按模式大幅扣分；未知生效警告不猜類別，分數上限為 3。`CANCEL` 不視作生效，同一 warning family 只採最嚴重項。

理由：黑雨及八號或以上是 product spec 的硬性要求；海嘯警告同屬官方結構化警告中的明顯重大安全事件，採相同保守覆蓋。未知警告不可靜默當作安全。

## D-012：可解釋的級距扣分，而非加權平均

每個 fresh 量度只命中一個集中定義的級距，從 10 分扣減後 clamp 至 0–10，再套警告 cap。過去一小時雨量、結構化 nowcast 及晾衫的有限預報詞表先各自產生候選，再只選最高 penalty 成為單一 `rain-risk`；其他來源只作輔助證據，不重複扣分。溫度、濕度、UV、AQHI 及熱濕協同各自產生可追蹤原因。一般／運動／晾衫採不同 penalty，但共用同一 pure function。

理由：級距規則能逐項向使用者說明，也便於測試所有邊界；比不透明的加權平均更符合「清楚解釋扣分原因」。

## D-013：警告清單完整性與已解析警告分開保存

`warnsum` 根節點有效但有警告項目缺少 required fields 時，保留所有能解析的警告，同時把 `isSnapshotComplete` 設為 `false`。計分仍會讓已解析的黑雨／八號風球覆蓋至最高 1 分，但不完整快照本身把分數上限設為 3；UI 不會顯示「未見生效警告」。optional 欄位格式錯誤而警告代碼、名稱及 action 仍可確認時，不會誤判整個項目不完整。

理由：逐項容錯不可變成「被排除的警告不存在」。同時保留可確認的嚴重警告，才能避免單純把整個來源降級後反而失去更嚴格的安全覆蓋。

## D-014：展示名稱與上游識別字分離

AQHI 以英文 station id 做官方資料配對，但 UI 只顯示繁體中文站名；全港模式標示為「全港一般監測站最高（站名）」。HKO 雨量地區先移除可變的尾隨「區」再比對，以兼容實測曾出現的「深水埗」與「深水埗區」。

理由：上游識別字可保持穩定比對，使用者介面則遵守全繁體中文要求，並誠實交代全港模式採最高有效一般站而非虛構平均值。

## D-015：語義範圍與嚴格日曆驗證在 normalization 邊界處理

結構 parser 先接受有限數字；normalization 再按欄位拒絕負雨量、超出 0–100% 的濕度、負 UV 及明顯不合理氣溫。HKO 時間必須有明確 offset，並通過嚴格年月日檢查，禁止 JavaScript 把 2 月 30 日自動捲到 3 月。被拒數值標示 `malformed`、保留來源時間供診斷，但不參與計分。

理由：把結構與欄位語義分離，能保留部分可用資料，同時阻止格式正確但語義不可能的值污染建議。

## D-016：拒絕定位時先保留首屏結果

定位被拒、逾時或不支援時先使用香港整體模式；十八區按鈕會自動顯示在結果卡之後，而不是插在結果之前。使用者選區後清單收起，完成更新時把鍵盤焦點移到新結論。

理由：同時滿足一鍵地區 fallback 與「手機首屏先看到有用結論」，並避免按鈕卸載後鍵盤焦點無故消失。

## D-017：瀏覽器載入流程必須在獨立期限內收斂

瀏覽器呼叫內部 `/api/outlook` 時另設 12 秒 deadline，長於 server 端單一官方來源的 8 秒 timeout。只有因 React effect cleanup 而由 caller signal 主動取消的舊請求可以靜默忽略；timeout、HTTP、格式、網絡及仍 mounted 時收到的 `AbortError` 都必須寫入同一個可重試失敗狀態。SSR loading 卡另以純 HTML／CSS 延遲顯示「重新載入整頁」連結，令 client hydration 未啟動時仍有操作出口。

理由：server 到政府 API 的 timeout 不等於瀏覽器到內部 route 的 deadline。若內部 route 或 response body 永不完成，或把非 cleanup abort 一律吞掉，原本以 request key 判斷的 loading 會永久為真。獨立邊界與明確終止狀態可避免用預設資料掩飾錯誤，同時保留 React Strict Mode 及地區切換所需的正常取消行為。

## D-018：首頁採「天空狀態帶」決策層級，不增加圖示依賴

首頁以緊湊位置列、活動 segmented control、狀態化 Hero 與 2 × 2 主要因素組成首屏。桌面以約 65／35 比例分開「外出決策」與「環境脈絡」，手機則維持單欄及 360px 無橫向捲動。安全、警戒及危險狀態同時使用文字、符號與色彩；長預報及逐來源時間移入原生 `details` accordion。

圖示採用專案內輕量 inline SVG，統一使用圓角線條與 `currentColor`，不新增 production dependency。所有視覺 tokens 集中於 `app/globals.css`，並保留系統深色模式及 reduced-motion。

理由：把首頁從資料目錄轉為普通市民可在數秒內理解的決策工具，同時避免為少量靜態圖示增加 bundle、供應鏈與維護成本。

## D-019：WeatherScene 只由 fresh 官方資料與香港時間推導

新增 pure `deriveWeatherScene(weatherData)`，集中把 HKO `rhrread.icon`、所選地區過去一小時雨量、`warnsum` 及 payload `generatedAt` 映射為 scene、日夜、雨勢、嚴重度、動畫開關及可解釋原因。結構化嚴重警告優先於一般圖示；雨量以 `<2.5`、`2.5–<10`、`≥10 mm` 對應 light、medium、heavy。第一版固定以香港時間 07:00–17:59 為日間，其餘為夜間；只影響色調，不進入評分。

Normalization 額外把 `iconUpdateTime` 保存成 `conditionIcons` metric，沿用既有 weather 90 分鐘 freshness 門檻。警告快照不可用／不完整、icon 或雨量 missing／malformed／stale 時使用 neutral 靜態背景；不以未來降雨、預報文字、隨機 scene 或其他來源猜測現況。已確認的嚴重警告本身足以覆蓋一般圖示。

視覺只使用 CSS gradient、原創 inline SVG 雲層及 Canvas 雨線，不新增圖像或 dependency。Canvas 的隨機值只控制雨線位置，不參與天氣判斷；scene 選擇完全 deterministic。動態偏好使用版本化 localStorage key `weather-scene-motion:v1`，只保存 `on`／`off`，不包含位置、天氣或其他使用資料；reduced-motion 永遠優先停用動態效果。

理由：背景是資料的輔助表達，不可比評分及警告更具推測性。獨立 pure function、freshness metric 與 stable visual key 令 mapping 可測試，並避免相同 scene 的資料刷新重啟動畫。

## D-020：Harbour Sky 藍色是品牌，狀態色只表達狀態

全站固定以 `#061827`／`#0A2740` 深海藍作背景、`#49A9F8`／`#78CBFF` 作品牌及互動色，並在 `app/globals.css` 集中保存 surface、文字、邊框、focus 與 safe／warning／danger tokens。綠色只用於適合出門、資料正常或成功；黃色只用於警戒；紅色只用於危險。Hero 與一般卡片的 surface、邊框及高光保持藍色，不再以 verdict 狀態色染滿主卡。

普通天氣以分拆的背景、固定星位夜空、三個環境光暈、遠近兩層雲、霧氣 overlay 及既有 Canvas 雨景組合。星星只在 `clear + night` 顯示；雲與光暈只動畫化 `transform`／`opacity`；雨景在頁面隱藏、motion off 或 reduced-motion 時停止 requestAnimationFrame。development preview 提供明確命名的日／夜、多雲、陰天、小雨、大雨、雷暴、中性及減少動態場景。

使用者關閉動態偏好時，所有非必要 CSS animation／transition 及 Canvas loop 一併停止，而不只停止天氣背景；14 秒後顯示的整頁重載提示屬功能性錯誤出口，保留零時長的延遲揭示。`prefers-reduced-motion` 仍具最高優先權，即使手動偏好為開啟亦只顯示靜態內容。

理由：把品牌與安全語意分開可避免「全站都是安全綠」的混亂；固定、低對比的天空層令普通天氣有生命力，同時維持 deterministic scene、文字可讀性、低主線程成本及無 layout shift。

## D-021：AQHI 健康風險級別作有限的大小寫正規化

`health_risk` 只接受 `Low`、`Moderate`、`High`、`Very High`、`Serious` 五個官方語義級別，但比對時不區分英文字母大小寫，輸出則正規化為一致的 title case。AQHI 數值、站點與發布時間仍按原有嚴格規則驗證，不接受模糊或相近字眼。

理由：2026-07-27 重驗官方端點時，實際回應樣本在 AQHI 8–9 使用 `Very high`，與既有文件及較低風險值的大小寫風格不一致。若整列拒絕，會剛好漏掉需要扣分的高污染觀測；有限集合正規化可容忍上游大小寫差異而不放寬風險語義。

## D-022：Coverage 門檻只量測核心業務與 API 邊界

Vitest coverage 明確包含 `lib/**/*.{ts,tsx}` 與 `app/api/**/*.ts`，並排除測試、E2E、generated／build output、設定檔及純型別定義。初始全域最低門檻為 statements 88%、branches 80%、functions 90%、lines 90%；HTML、文字與 JSON summary 報告一併產生。

理由：核心 parser、aggregate、normalization、location、validation 及 scoring 的風險與 React／Canvas 呈現層不同。把兩者混成單一數字會令低風險動畫細節掩蓋真正的資料安全分支；只量測已 import 的檔案則會虛高。明確 include 會把未被測試載入的核心檔案以 0% 計算，門檻亦保留合理提升空間。

## D-023：Playwright 以 route interception 驗證完整瀏覽器流程

Playwright 使用 Chromium、固定 `127.0.0.1:3100` 開發伺服器、單 worker、固定時區／語系及 `page.route("**/api/outlook?*")`。測試 fixture 直接符合 `OutlookPayload` 型別，按 query location 回傳不同地區結果；定位成功使用瀏覽器 geolocation permission，拒絕則使用無權限 context。每個案例統一收集 console error 與 page error，失敗時保存 trace、截圖及 HTML report。

理由：E2E 的目的是真實驗證 React hydration、fetch、定位、模式／地區切換、焦點、reduced motion 與 responsive 行為，而不是再次測政府服務可用性。完全攔截內部 route 可避免 live API、時間及網絡波動，單 worker 則避免共用 Next.js 開發伺服器在首次編譯時互相干擾。

## D-024：CI 單一 job 順序執行品質閘門

GitHub Actions 在 `push` 與 `pull_request` 上以 Ubuntu、Node.js 24.x、npm cache 及最小 `contents: read` 權限執行。Workflow 使用目前受維護的 `actions/checkout@v6`、`actions/setup-node@v6` 與 `actions/upload-artifact@v7`。單一 30 分鐘 job 依序安裝 lockfile dependencies、Playwright Chromium 與 system dependencies，再執行 lint、typecheck、Vitest coverage、production build 及 Playwright E2E。Coverage 每次保存七日；Playwright 失敗時保存 HTML report、trace、截圖及 test results。

CI 不另行執行 `npm test`，因 `npm run test:coverage` 已用相同 Vitest 設定完整執行所有單元／元件測試。E2E 保留既有 `/api/outlook` route interception，不連接政府 API；workflow 不需要 secrets，也不觸碰 Vercel 設定。

理由：單一 job 避免多次 `npm ci` 與 Chromium 安裝，並確保 E2E 只在較便宜的靜態、型別、單元及 build 閘門通過後執行。Node.js 24.x 是目前 LTS，符合 `package.json` 所列 `>=20.9.0`，亦與本機驗證環境及 `@types/node` 24 對齊；不採用已於 2026-03-24 EOL 的 Node.js 20。

## D-025：降雨臨近預報以來源時間、十八區代表格點及精簡 snapshot 為契約（歷史）

此節保留 2026-07-30 首版五欄 CSV 決策；cache failure 行為已由 D-033 取代，transport／parser 契約已由 D-034 取代。來源時間、四段區間、代表格點、香港整體聚合及精簡 snapshot 語義仍有效。

官方 CSV 的四段原始區間固定為 `updatedAt` 後 0–30、30–60、60–90、90–120 分鐘。每段保存原始 `periodStartAt`／`periodEndAt`；API 回應時只計算尚餘覆蓋及 `isPartiallyElapsed`，不改寫第一段起點，也不按餘下時間比例縮放完整半小時雨量。採用保守政策：進行中第一段仍參與評分，但文案明示雨量屬完整半小時累計預測、部分時段已經過去。`firstRainWindow` 是尚未完結 periods 中第一組雨量不少於 0.5 mm 的連續區間，遇到第一段低於門檻便結束；較後再次出現的雨由 peak 及實際 scoring driver 分開表達。

Server 只收到 canonical location id。解析完整 CSV 後，使用 haversine distance 為十八區靜態中心各選一個最近格點；距離完全相同時依緯度、經度升序決定。每區四段必須來自同一格點。香港整體逐段採十八區代表格點最高值，屬偏保守的產品取捨，不代表全港每個位置。Cache 只保存 72 個地區值及四個全港衍生值；browser 只收到當前位置四段。

CSV header 在移除 BOM 及欄位首尾空白後必須恰好等於官方五欄。時間／座標非法、混合更新時間、缺少四段，或任何所選代表格點的必要 period 缺少、重複、負值／非數字均為致命。座標合法但不屬任何代表格點的非法雨量屬可恢復問題，只記入 issues。Transport 使用 5 MiB、100,000 rows、完整 8 秒 timeout；cache soft TTL 為 10 分鐘，freshness hard expiry 為 24 分鐘。第一版不採 stale-if-error：refresh 失敗即暫停使用 nowcast，避免把舊值誤當最新。

理由：CSV 每 12 分鐘發布，因此使用者看到的實際餘下覆蓋通常少於兩小時。保存來源語義、限制資料邊界及只依賴產品真正使用的代表格點，可避免虛假精確、無關海上壞列拖垮結果、CORS、大 payload 及過期預報風險，同時保持原有私隱邊界。

## D-026：跨來源降雨只選一個 driver，附加來源狀態不等於評分受限

過去一小時觀測、四段 nowcast 及晾衫文字預報分別計算候選 penalty，只選一個 `rain-risk`。排序為：penalty 較高；有明確 `effectiveStartAt` 優先於未知時間；較接近 `generatedAt`；最後依 nowcast、即時觀測、文字預報。進行中 nowcast 與即時觀測以 `generatedAt` 排序，未開始 nowcast 使用實際 `periodStartAt`，文字預報永遠是未知時間。Nowcast 四段不累加；Hero 同時交代首個雨段、真正扣分時段及不同時的最高雨量時段。

Nowcast 的本站 penalty 規則如下；三個數字依次為一般／運動／晾衫，並非天文台官方外出分數：

| 完整半小時預測雨量 | 一小時內開始 | 一小時後開始 |
| --- | --- | --- |
| 0.5–<2.5 mm | 1／2／7 | 0／1／5 |
| 2.5–5 mm | 2／3／8 | 1／2／6 |
| >5 mm | 3／5／9 | 2／3／7 |

`payload.status` 代表五個來源是否完整；`result.isLimited` 只代表實際評分所需的核心證據是否不足。Nowcast 單獨 failed／stale／malformed 時 payload 是 `partial`，但不加入 `ignoredFactors` 或 score cap，Hero 保持「資料齊備」，另以 banner 說明目前分數仍按已確認的即時觀測及警告計算。只有 nowcast 成功而四個核心來源全失敗時仍是 `error`。

理由：相同雨勢不可因來源重疊而重複扣分；最早雨段、最大雨量與真正 driver 亦不可在文案中互相矛盾。把來源完整性與評分充分性分開，可避免「分數沒有受影響，Hero 卻稱資料有限」的產品錯誤。

## D-027：PWA 只離線保存應用外殼，不保存天氣或位置結果

PWA 使用 Next.js 原生 manifest、手寫 service worker 與自包含離線頁，不加入 PWA 套件。Service worker 只把明列的離線頁、品牌圖示及成功的同源 `/_next/static/` 資源寫入以 `go-out-` 開頭的版本化 Cache Storage；導航／SSR HTML 不寫入 Cache Storage，`/api/`、錯誤回應、天氣 payload、地區及定位資料一律不保存。瀏覽器及 route 的 `/api/outlook` 請求繼續明確使用 `no-store`。

離線或資料服務失敗時直接不 render 舊數值、評分、建議、警告或資料驅動背景。兩者分別顯示「目前離線」及「暫時無法取得天氣資料」；只有最新請求成功取得 runtime-validated、非 error payload 才恢復 UI。localStorage 只額外保存 iPhone 安裝提示是否已關閉，以及最新可用 payload 中最新的官方 `publishedAt` ISO 時間，所有讀寫均可失敗而不影響頁面。

每次改動 service worker、離線頁或 core allowlist 必須遞增 `CACHE_VERSION`，令 installing worker 不會改寫 active worker 的 cache。更新不使用 `skipWaiting()`；新版等待舊受控頁面全部關閉後才 activate、以 `clients.claim()` 接管及清理同專案前綴的舊 cache。

理由：即時外出判斷的主要風險不是離線功能不足，而是舊天氣看似仍然即時。只離線保存應用外殼可提供可安裝及有限離線體驗，同時維持 freshness、私隱、SSR 與政府資料 failure semantics；原生平台能力亦足以覆蓋目前單頁產品，無需承擔額外 build plugin 與 runtime caching abstraction。

## D-028：結論優先的無框 Hero 與漸進式資料層級

首頁以「是否適合出門」作第一視線：結論用高對比白字直接浮在既有 WeatherScene 上，安全／準備／避免只以語意圖標、小型外出指數及文字共同表達。0–10 分數仍保留可見 `n/10` 及可存取 progressbar，但不再是最大視覺元素。位置改為包含狀態及更新時間的緊湊 pill，活動模式繼續使用三個一按按鈕；動態背景開關收斂成具完整 accessible name 的 44px 圖標按鈕。

降雨是唯一主要玻璃資料卡，直接以既有四段半小時值繪製 CSS 柱，並保留觀測、實際時段、部分已過時段、來源及 freshness 文案。體感、UV、AQHI 只顯示主值及風險摘要；詳細來源時間移至同區底部及來源 disclosure。沒有生效警告且快照完整可用時不 render 警告區；有警告時使用獨立雙格，快照 stale、unavailable 或不完整時必須另顯審慎提示。預報、提示、逐來源時間及免責聲明下移至微型頁底層級，但最新更新及來源數保持可見。

定位拒絕後不再自動展開十九個地區按鈕；香港整體結果先保持可見，使用者可在地區 pill 一按展開緊接控制列的選擇器。此項取代 D-016 的自動展開位置安排，但保留一按 fallback、選區後收起及把焦點移到新結論。手機維持單欄，桌面只把同一組元件排列成決策／觀測雙欄；不建立另一套桌面元件。

理由：使用者首先需要可行動的結論和準備事項，而不是一個巨型分數或四張等權重卡片。沿用原生 `details`、既有 SVG 圖標、CSS 及資料契約即可完成新的資訊層級，無需字體、圖表或 UI dependency；同時保留安全、freshness、無障礙及失敗語義。

## D-029：背景與天氣動畫是視覺主角，操作與文字退居前景

地區與目前活動合併成同一粒緊湊 pill；點開後才顯示三個活動模式與地區選擇。此項取代 D-028 的常駐三模式控制列及 pill 內可見更新資訊，更新時間仍保留在頁底摘要，定位狀態仍提供給輔助技術。Hero 不再顯示重複的模式、資料齊備標籤，並縮小結論、建議、錯誤提示與資料卡的字級及留白。

背景採兩張同構圖像：正常情況使用無降雨的香港海港天空，只有資料確認為雨天或暴雨時才使用帶雨版本；既有 Canvas 降雨、雲層及 reduced-motion 行為不改寫。玻璃面降低不透明度，圖像及動畫成為頁面主要視覺，不新增前端依賴。

右上角「動態背景」開關只控制 WeatherScene 的照片過場、環境光、星空、雲、霧及雨線，不得停用載入進度、控制項或其他功能性介面動畫。系統 `prefers-reduced-motion` 仍獨立套用全站減少動態規則。

理由：首屏的識別重點是實際天氣氛圍與動畫，前景只需快速回答地點、活動與外出決定。把非當前選項及次要狀態收起，可在保留資料安全與可存取資訊的同時，避免控制列和大段文字遮蔽背景。

## D-030：照片固定於 WeatherBackground 基底，場景層只負責透明色調

正常、晴天、多雲、炎熱及資料不足狀態固定使用無雨海港照片；只有 `rain` 或 `storm` 場景使用暴雨照片。照片由穩定的 `.weather-background` 承載，交叉淡入的 `.weather-background-layer` 不再持有照片或不透明漸層，只疊加低透明冷暖色調。全頁 readability、環境光及主要資料卡亦降低遮蔽程度，文字依靠既有陰影、局部玻璃及邊框維持對比。

理由：照片若與多組 scene `background` shorthand 共用同一層，cascade 或舊編譯結果會令圖片被純色覆蓋；固定基底可令圖片始終存在，同時保留資料驅動動畫、雨天語義、場景過場及 reduced-motion。

## D-031：背景矩陣按場景、香港日照時段及 viewport 原生選圖

此決策取代 D-030 的兩張共用照片安排。背景由 7 種場景 × `day | dusk | night` × `mobile | desktop` 組成 42 個固定路徑。每個交叉淡入層使用原生 `<picture>`：64rem 或以上只選 desktop，其餘只選 mobile；圖片使用 `object-fit: cover` 並只容許比例差造成的少量邊緣裁切。圖片本身不包含文字、雨線或閃電，降雨與危險強度繼續由既有 WeatherScene 動畫表達。頁面不預載或離線快取整個矩陣，也不新增圖片、天文或 UI 套件。

時段不再使用固定鐘點。系統以香港座標、payload 既有 `generatedAt` 及 NOAA 太陽位置近似公式純函式計算當日日出、日落與 civil dusk；日出至日落前 45 分鐘為白天，其後至 civil dusk 為黃昏，其餘為黑夜。無效時間仍回到不帶虛構天氣暗示的中性資料狀態，不修改 API payload、評分或 freshness。

理由：桌面與手機各自載入原生方向可避免把直圖放大裁成橫圖；日期感知的黃昏區間亦比固定 18:00 更符合香港季節變化。集中路徑函式與純計算已足夠覆蓋選圖及測試，不需要資產 registry、天文 API 或第三方套件。

## D-032：JSON transport 限制解壓後 1 MiB，已知漏洞以精確 override 暫時封堵

四個官方 JSON 回應在串流解碼時限制實際讀取的解壓後資料為 1 MiB，並保留完整 8 秒 deadline；Content-Length 或實際串流超限均取消 body、abort request、回傳安全的 `too-large` 錯誤且不寫入 cache。官方實測回應均少於 4 KiB，1 MiB 保留充足格式增長空間。

Next.js 16.2.12 仍精確帶入有已知 high advisories 的 `postcss@8.4.31`，optional range 亦只接受 `sharp@0.34.x`。在沒有可用 stable Next patch 時，暫以 npm overrides 固定已修的 `postcss@8.5.25` 與 `sharp@0.35.3`；只有完整 lint、typecheck、test、build、E2E 及 audit 全數通過才保留，下一個帶入安全版本的 Next stable 發布後移除 overrides。

理由：JSON endpoint 同樣是外部 trust boundary，不應只有大型 CSV 受到資源限制；精確、可移除且經完整品質閘門驗證的 transitive override，比 `npm audit fix --force` 建議的破壞性 Next 9.x 降級更可控。

## D-033：Nowcast cache 以來源時間封頂，只 fallback 至仍新鮮的 snapshot

降雨臨近預報繼續使用 10 分鐘 soft TTL、來源更新後 24 分鐘 hard expiry、5 MiB／100,000 rows 邊界及完整 8 秒 timeout。Cache 的實際有效期改為擷取後 soft TTL 與來源 hard expiry 的較早者；命中 cache 時亦重新檢查來源時間，避免已接近過期才取得的 snapshot 在其後數分鐘仍被當作正常 cache 回傳。

Soft TTL 後的 refresh 若失敗，可回傳同一個已驗證 snapshot，但只限它在 refresh 完成時仍未超過 24 分鐘；跨過 hard expiry 後必須回傳實際失敗或新取得的 stale 狀態，並繼續排除於評分。這是 fresh-if-error，不是放寬 stale 資料政策。UI 分開說明 `stale`、`failed`、`malformed`；只有非代表格點等可恢復 issue、而所選四段預報仍為 fresh 時，問題留在來源詳情，不顯示全頁 partial banner。

理由：官方約 2.7 MB CSV 在實測中下載延遲波動明顯，而來源發布時間亦可能在擷取時已接近 24 分鐘。單純提高 timeout 會拖慢整個首屏；沿用仍新鮮的 compact snapshot 並以來源時間限制 cache，可在不新增 endpoint、dependency 或過期風險下修正重試命中舊 cache及短暫 transport 波動。

## D-034：Nowcast 改用官方 CSDI ZIP，停止即時下載 2.7 MB CSV

2026-08-02 實測舊五欄 CSV 在 60 秒內只傳送約 475 KB／2.70 MB，單靠延長 timeout 無法成為可靠產品功能。DATA.GOV.HK 的同一 dataset 提供官方 CSDI ZIP；實測檔案約 16 KB、3.4 秒完成，內含約 216 KB、840 格點 × 4 時段的十七欄 CSV。Runtime 改用 ZIP，既有地區格點、freshness、cache、normalization、評分及 UI 契約不變。

ZIP transport 只接受單一、未加密、deflate 壓縮且檔名固定的 CSV entry；實作以直接 production dependency `yauzl@3.4.0` 讀取及解壓 entry，並以 Node `zlib.crc32`（可用時）或本地相容 fallback 驗證 central directory 宣告的 CRC-32。壓縮後限制 512 KiB、解壓後限制 5 MiB，CSV 仍限制 100,000 列及完整 8 秒 deadline。

CSDI 產生器會改變十七欄順序，因此 parser 只接受恰好 17 個唯一官方欄名，再按名稱映射；每列亦必須恰好 17 欄。舊五欄 header、缺少、額外或重複欄均明確拒絕，不設 feature flag、fallback 或 migration mode。上游 request 只宣告接受 `application/zip` 與較低優先序的 `application/octet-stream`，response 亦只接受這兩種 Content-Type。此契約取代 D-025 的舊五欄 transport／parser 安排，既有 freshness、cache、normalization、評分與 UI 契約維持不變，亦不使用第三方天氣服務。

理由：這是同一官方資料的較小傳輸格式，能直接修正冷啟動長期逾時，而不需要移除未來降雨功能、建立背景工作、資料庫或付費服務。此決策取代 D-025 對 2.7 MB CSV transport 的安排；D-033 的 fresh-if-error 與來源 hard expiry 規則繼續有效。

## D-035：地區 pill 原地展開為全寬 overlay

地區及目前活動仍由同一個 pill 觸發，但活動模式與十九個地區選項改為 pill 內部的展開內容。控制區使用固定高度錨點保留原有版面位置；展開表面由該錨點絕對定位並橫跨 app 內容區，因此不會把 Hero 或資料卡向下推。手機限制展開內容高度並在卡內捲動，桌面沿用既有四欄地區網格。

展開時以輕微固定遮罩降低後方內容強度；再次點擊 pill、點擊遮罩、按 Escape、選擇活動或地區均會關閉。Escape 及遮罩關閉會把焦點送回 pill，reduced-motion 會移除新增的展開及遮罩動畫。資料請求、定位私隱、評分及 API 契約不變，亦不新增 UI dependency。

理由：使用者操作的是同一組「地區＋活動」條件，不應在點擊後得到另一張視覺上分離並改變頁面排版的卡片。沿用現有 React 狀態、按鈕及 CSS 定位即可建立清楚的原地變形，同時解決桌面右側留白與手機內容過高問題。

## D-036：同一外框以原生尺寸動畫在 pill 與 picker 間形變

地區 pill 與展開 picker 改由同一個 `.location-panel` 持有邊框、玻璃背景及陰影，不再於開啟時把外觀由按鈕瞬間交給另一張卡片。控制狀態分為 `closed`、`opening`、`open`、`closing`；原生 Web Animations API 以實際 DOM 尺寸動畫化寬度、高度及圓角，展開使用 360ms 柔和回彈，收起使用 260ms 反向形變。選項在外框開始拓展 120ms 後才淡入，收起時先淡出並保留 DOM 至外框回到 pill 尺寸。

快速重複點擊會量度目前呈現尺寸、取消舊動畫並由該尺寸反向。Escape、遮罩、再次點擊及完成選擇共用相同收起流程；資料更新不等待動畫。系統要求 reduced motion 或 `Element.animate()` 不可用時直接切換最終狀態。沒有新增動畫 dependency，固定錨點、全寬 overlay、手機內部捲動、定位私隱、評分及 API 契約不變。

展開時仍立即把焦點移到已選地區，但使用原生 `focus({ preventScroll: true })`，避免瀏覽器為顯示仍藏在 50px 動畫外框下方的按鈕而捲動 `.location-panel`，令 pill 標題列先跳走再回位。

理由：原本的 160ms 透明度／位移動畫只令完整卡片突然出現，沒有表達「同一控制項展開」的空間關係。量度兩端真實尺寸可避免硬編碼不同地區名稱的 pill 寬度；保留反向生命週期則避免收起時 DOM 先消失而無法完成形變。

## D-037：地區控制外框在形變期間固定使用 25px 圓角

地區控制的關閉膠囊及展開面板統一使用 25px 外框圓角，Web Animations 只改變寬度及高度，不再把 CSS 膠囊值 `999px` 插值至卡片值 `20px`。鍵盤焦點環亦在所有階段由同一個 `.location-panel` 持有。

理由：50px 高膠囊的實際圓角是 25px，但動畫直接插值 `999px` 會在元素高度增加時觸發瀏覽器的圓角比例限制，令定位圖標旁的左上弧線非線性跳動。固定實際圓角同時保持弧心對齊、消除焦點環擁有者交接，並減少一項不必要的動畫屬性。

## D-038：資料 ready 前不下載中性背景，現有像素尺寸視為可接受限制

Production Playwright 冷快取量測確認首頁原本先下載 neutral，再於 `/api/outlook` 回來後下載實際場景；390×844 因此傳輸 654,670 bytes，1440×900 傳輸 611,790 bytes。載入、離線及不可用狀態改為只顯示既有深藍純色底，資料 ready 後才建立 WeatherScene；修正後兩種 viewport 均只請求一張正確方向及場景的 WebP。場景切換仍只新增一張資產，沒有預載矩陣或手機／桌面交叉下載。圖片解碼失敗時隱藏破圖元素並沿用同一純色底，成功載入新場景時恢復顯示。

現有 desktop 1659–1660×948、mobile 941×1672 定為可接受限制；1792×1024／1024×1792 只屬日後原生重新生成時的設計目標。390、430、1440 截圖沒有放大；1920×1080 的 desktop 圖按 cover 約放大 1.15 倍，但實際截圖未見肉眼可辨模糊。沒有重製、upscale、重壓縮或更改 42 張 WebP。

理由：取消一張無用的初始請求可直接減少約 296–308 KiB resource bytes，並令低速背景完成時間由約 18.00 秒降至 12.15 秒；單純插值放大不會增加細節，而目前畫面沒有證據支持承擔全矩陣重製成本。

## D-039：載入體驗優先，恢復 responsive neutral 預設背景

此決策取代 D-038「資料 ready 前不下載中性背景」的安排，但保留其圖片尺寸結論及失敗 fallback。首頁在 loading、offline 或 unavailable 等 safe 狀態重新渲染完整 WeatherScene，使用固定日間 neutral 手機／桌面圖；資料 ready 後以既有 key 重新掛載實際場景及交叉淡入。圖片解碼失敗時仍隱藏破圖並顯示深藍純色底。

Production Playwright 實測 390×844 與 430×932 依序只請求 `neutral-mobile.webp`、`clear-mobile.webp`，合計 654,670 transferred／654,070 resource bytes；1440×900 只請求對應兩張 desktop 圖，合計 611,790／611,190 bytes。沒有方向交叉下載或預載其餘 40 張資產，也沒有新增預覽圖、計時器或依賴。

理由：產品明確選擇保留載入期間的完整海港背景，並接受約 303–315 KiB 的額外初始傳輸。沿用既有 neutral 資產與 WeatherScene 是最小且一致的恢復方式；另造低解像度預覽或延遲門檻會增加資產及狀態複雜度。

## 2026-08-03：背景圖片完成載入後才交接

WeatherScene 在 loading 轉 ready 時保持掛載；新場景圖片完成載入後才淡入，載入期間或失敗時保留上一張可用背景，避免純色 fallback 短暫露出。

## D-040：WeatherScene 各 freshness 訊號獨立，當前 nowcast 可表達降雨

WeatherScene 不再把天氣圖示、過去一小時雨量、warning snapshot 或 nowcast 的 freshness 互相當作必要條件。已識別且可用的 storm warning 優先；其後依序使用 fresh storm icon、fresh observed rainfall、fresh 當前 nowcast（當前半小時雨量至少 0.5 mm）、fresh rain icon、fresh hot warning／氣溫及一般 fresh weather icon。warning source unavailable 或 stale 只限制該 warning 訊號；未知生效 warning 仍安全回到 neutral，已確認的 storm warning 即使 snapshot 尚未完整仍可保留 storm。

這只改變視覺場景的訊號組合，不放寬 freshness，也不把 stale 或 future-only 資料帶入評分、建議或安全結論。沒有任何可用訊號才回到 neutral；loading、整體 error 及資料取得失敗仍由上層使用 neutral。

## D-041：預設 neutral 圖片按香港時段使用 clear 資產

首頁由 dynamic SSR 以伺服器當刻時間及現有香港日照函式決定初始 `day`、`dusk` 或 `night` period，並把 period 傳入 client component，避免 hydration mismatch 及先下載錯誤時段圖片。所有 semantic `neutral` 場景仍保持 neutral data attribute、靜態動畫及安全回退語義，但圖片路徑改用同一時段的 `clear-mobile.webp`／`clear-desktop.webp`。這只改變照片，不把無資料狀態宣稱為晴天；不加入 client 時段計時器，頁面長時間開啟時不在日照邊界自動切圖。

理由：使用者開站首屏需要符合香港當刻時段的海港視覺；沿用既有 clear 資產及 `picture` responsive 選圖即可完成，並以 dynamic SSR 保持首次 HTML 與 hydration 一致。接受首頁失去完全靜態輸出，換取準確的首次背景及避免 neutral 圖片重複下載。

## D-042：氣象數值採保守合理範圍並按欄位降級

`/api/outlook` 內會進入 UI 或評分的連續氣象數值採 inclusive 範圍：過去一小時雨量 0–500 mm、每段半小時 nowcast 雨量 0–250 mm、氣溫 -10–60°C、相對濕度 0–100%、UV 指數 0–50、內部 AQHI 1–11（11 只代表官方 `10+`）。香港天文台總部歷史氣溫約為 0.0–36.6°C，而區域站曾錄得 39.0°C；區域一小時雨量紀錄為 211.5 mm。因此氣溫及雨量界線保留明顯安全空間，不會排除可合理預見的本地極端天氣。濕度使用百分比物理界線；天文台把 UV 11 或以上均列為極高風險，50 是只排除明顯損壞資料的寬鬆上限；AQHI 官方格式只容許 1–10 及 `10+`。

欄位缺失以既有 `missing` 表達；錯誤型別、NaN、Infinity 或繞過 server normalization 的超界非空值不符合 browser payload contract；有限但超界的官方一般天氣觀測由 normalization 轉成該欄位 `malformed`／`value: null`，不 clamp，其他同來源新鮮欄位仍保留。評分只忽略該欄位並沿用資料不完整上限。天氣圖示是官方類別代碼而非連續氣象量；未知代碼本來就不會選擇場景，因此不套用人造連續範圍。本港預報的氣溫及風力目前只存在於文字欄位，payload 沒有 forecast temperature、wind speed 或 gust 數值可驗證。

理由：範圍應阻止損壞資料進入 UI／評分，但不應把真實極端天氣壓成邊界值，亦不應因一個可隔離的觀測欄位而丟棄整個天氣來源。

## D-043：先以同源 Report-Only CSP 量測，保留已證實的 inline 妥協

全站先送出 `Content-Security-Policy-Report-Only`，不啟用強制 CSP。production 的 script、style、圖片、API、Service Worker、manifest 及 42 張背景只允許同源；沒有字型、frame、object、form 或 media 資源，因此對應 directive 設為 `'none'`。政府天氣及 AQHI endpoint 只由 server fetch，不加入瀏覽器 `connect-src`。

目前 Next.js App Router 會在 production HTML 產生 inline hydration script，layout 與離線頁亦有必要 inline script，React 元件則使用 style attribute，因此 production 暫時只在 `script-src` 與 `style-src` 保留 `'unsafe-inline'`。`'unsafe-eval'` 及同源 `__nextjs_font` 只供 Next.js development 使用；production 明確排除 eval 並維持 `font-src 'none'`。沒有允許 `data:`、`blob:`、通配符或外部網域。本階段沒有 remote CSP report collector，Report-Only 違規只透過本機或自動瀏覽器測試的 console 觀察；只有在建立有界限、重視私隱且具實際監控用途的 collector 時才加入 `report-to` 或 `report-uri`，不保留只丟棄資料卻消耗 Function 請求的 endpoint。

理由：nonce 架構會把目前的動態首頁全面改為逐請求渲染，超出本輪 Report-Only 量測範圍。先用可運作且可分類的最小政策取得 Chromium／WebKit 證據，再另行評估 nonce 或 hash，避免把開發工具、server-side 來源或不必要網域誤加入 production CSP。

## D-044：AQHI 數值與官方健康風險級別必須一致

AQHI parser 除了分別驗證數值格式與五個官方健康風險字眼，亦驗證固定配對：1–3 Low、4–6 Moderate、7 High、8–10 Very High、10+ Serious。不一致的站點列會標示問題並逐列排除，不會自行推導或覆寫上游文字；同一回應內其他有效站點仍可使用。

理由：評分採 AQHI 數值，UI 同時展示健康風險文字；若兩者矛盾但都各自合法，便會向使用者呈現互相衝突的健康資訊。拒絕不一致列可維持官方資料的可追溯性，也符合 malformed fields 不應靜默影響結果的產品原則。

同一對照亦在 browser-facing internal route boundary 重驗：AQHI metric 有值時 `healthRisk` 必須精確配對；metric 無值時 `healthRisk` 必須為 `null`。這不是第二套 mapping，而是重用 server parser 的單一對照，避免 route contract drift 或測試 fixture 繞過 D-044。

## D-045：測試 provenance 不進入 production warning payload

Warning summary 的根層 key 是上游動態 warning family，production parser 不保留供 fixture 使用的 key prefix，也不靜默略過 `$` 開頭項目。Live fixture 的 provenance 統一存放於既有 `tests/fixtures/_metadata.json`；payload fixture 只保留官方回應形狀。

理由：若 production parser 為測試資料保留 `$metadata` 特例，未來任何同 prefix 的有效 warning family 都會被當成測試欄位而無 issue 消失，並令 warning snapshot 錯誤保持完整。把 metadata 移回既有 out-of-band registry 可同時刪除重複資料與整個 runtime bypass。
