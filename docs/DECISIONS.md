# 技術決策紀錄

更新日期：2026-07-14

## D-001：使用單一聚合 server route

採用 `/api/outlook?location=<canonical-id>`，由伺服器並行擷取及正規化四個官方來源。瀏覽器不直接依賴政府 schema，只接收穩定的內部資料格式。

理由：可隔離個別 API 失敗、集中 timeout／cache／validation／freshness，亦減少手機端請求次數。

## D-002：精確位置只留在瀏覽器記憶體

瀏覽器取得 latitude／longitude 後，使用本地靜態十八區中心點選出最近地區，只把 canonical district id 傳到 `/api/outlook`。不寫入 storage、analytics、database 或伺服器 log 的應用資料。

理由：滿足「目前 session 內使用」及資料最小化；MVP 不需要地圖或地址反向編碼服務。區界附近可能分配到相鄰區，UI 會允許一鍵改選。

## D-003：不用大型 runtime schema dependency

以小型 TypeScript type guards／parsers 驗證 `unknown`，回傳「可用部分資料＋issues」。未知額外欄位不令整個來源失效，錯誤型別的個別項目會被排除。

理由：官方回應小而有限，手寫 parser 可明確容忍 HKO 的空字串 union 與 AQHI 型別差異，並避免增加非必要 production dependency。

## D-004：自管短期 server memory cache

API client 使用模組內 TTL cache，保存已驗證前的 JSON、實際 `retrievedAt` 與到期時間；upstream fetch 設 `cache: no-store`。預定 TTL：警告 60 秒、即時天氣 5 分鐘、預報 10 分鐘、AQHI 15 分鐘。

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
- AQHI 使用所有 fresh 一般監測站的最高值，標示為「全港一般站最高」。
- 不把三個路邊 AQHI 站混入一般使用者結果。

理由：資料源沒有官方「全港平均」觀測值；安全產品不應虛構平均數。最高值是產品的保守聚合決定，並非政府指定算法，必須清楚標示。

## D-007：警告不可由其他來源推斷

嚴重警告只使用結構化 `warnsum`。`rhrread.warningMessage` 只作輔助顯示。`warnsum` 成功回傳 `{}` 代表已確認無生效警告；請求或 parser 失敗則是 `unavailable`，兩者不可混同。

理由：規格明確禁止在警告 API 失敗時推斷安全。

## D-008：missing 與 stale 不扣虛構分，但會限制信心

只有 fresh、validated observations 可產生環境扣分。stale／missing 不會以舊值或零值產生環境扣分；只要所選模式有相關資料缺失、異常或過時，信心上限為 7，必定落在「可以出門，但需要準備」。警告未確認亦有相同上限。若所選模式完全沒有 fresh 相關觀測或生效警告，則回傳 `score: null`，而不是從 10 分開始。四個來源全失敗時不顯示分數。

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

每個 fresh 量度只命中一個集中定義的級距，從 10 分扣減後 clamp 至 0–10，再套警告 cap。雨量、溫度、濕度、UV、AQHI、熱濕協同及有限預報詞表各自產生一條可追蹤原因。一般／運動／晾衫採不同 penalty，但共用同一 pure function。

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
