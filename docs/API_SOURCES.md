\# Official API Sources



Only use official Hong Kong government data sources.



Do not replace them with weather.com, OpenWeather, Google Maps or another

third-party provider.



\## Hong Kong Observatory



\### Current weather report



GET:



https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread\&lang=tc



Expected information may include:



\- district rainfall

\- regional temperature

\- humidity

\- UV index

\- weather icon

\- special weather tips

\- update time



\### Weather warning summary



GET:



https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum\&lang=tc



Use this as the main structured warning source.



Do not infer the absence of warnings when the request fails.



\### Local weather forecast



GET:



https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw\&lang=tc



Use forecast text only as supporting context.



Do not make fragile decisions using arbitrary keyword matching without tests.



\### Official documentation



https://www.hko.gov.hk/tc/weatherAPI/doc/files/HKO\_Open\_Data\_API\_Documentation\_tc.pdf



\## Air Quality Health Index



\### Current AQHI by monitoring station



GET:



https://dashboard.data.gov.hk/api/aqhi-individual?format=json



Expected fields currently include:



\- station

\- aqhi

\- health\_risk

\- publish\_date



Always validate `publish\_date`.



If the data is stale, show it as unavailable and exclude it from scoring.



Official dataset page:



https://data.gov.hk/en-data/dataset/hk-dpo-datagovhk2-city-dashboard-aqhi



\## 香港網格點降雨臨近預報



GET:



https://data.weather.gov.hk/weatherAPI/hko_data/csdi/dataset/gridded_rainfall_nowcast.zip



官方資料：



\- Dataset：https://data.gov.hk/tc-data/dataset/hk-hko-rss-gridded-rainfall-nowcast-in-hong-kong

\- 資料字典：https://data.weather.gov.hk/weatherAPI/hko_data/F3/HKO_gridded_rainfall_nowcast_documentation.pdf

\- 天文台產品說明：https://www.hko.gov.hk/en/wxinfo/ts/explain.htm

\- 官方圖例：https://www.hko.gov.hk/en/wxinfo/awsgis/help_legend.html



DATA.GOV.HK 列明資料每 12 分鐘更新，提供未來兩小時的四段半小時

累計雨量。Runtime 使用同一官方 CSDI dataset 公開的 ZIP；ZIP 必須只含

`gridded_rainfall_nowcast.csv`，其 header 必須包含且只包含官方十七個

multilingual 欄名。實測欄位順序可隨 snapshot 改變，因此按欄名映射，

但缺欄、額外欄或重複欄仍是致命錯誤。日期、時間及時區分欄提供；每份檔案只接受一個更新時間，

時區必須為 `UTC+8`，必要結束時間

必須分別為更新後 30、60、90、120 分鐘。四段原始區間以來源更新時間

為起點，不可改成 API 回應時間。進行中時段的雨量仍代表整個半小時，

不可按剩餘分鐘比例縮放。



CSV 以十進位經緯度（degree）識別格點。官方約 2 公里產品及 CSDI

空間版本支援 EPSG:4326；應用以同一經緯度空間做 haversine 最近格點

選擇。精確 browser geolocation 仍只在瀏覽器記憶體內轉成 canonical

十八區 id；server 只按靜態地區中心為每區選一個格點。香港整體逐時段

採十八區代表格點最高值，並清楚標示為網站的保守聚合規則。



Server 解壓並驗證官方 ZIP 後只 cache 十八區共 72 個半小時值及四個香港整體

衍生值；每次 browser payload 只包含所選地區或香港整體的四段結果。

Cache soft TTL 為 10 分鐘，freshness hard expiry 為來源更新後 24 分鐘；

cache 的實際到期時間採兩者較早者，避免取得時已接近過期的 snapshot

仍按擷取時間保存完整 10 分鐘。Soft TTL 後 refresh 失敗時，只可沿用

仍在 24 分鐘內的已驗證 snapshot；一旦跨過 hard expiry 便立即停止使用，

不會把舊 snapshot 當作最新資料或用於計分。



Transport 固定限制：



\- `MAX_COMPRESSED_RESPONSE_BYTES = 512 * 1024`

\- `MAX_RESPONSE_BYTES = 5 * 1024 * 1024`（解壓後）

\- `MAX_DATA_ROWS = 100_000`

\- `REQUEST_TIMEOUT_MS = 8_000`



Timeout 覆蓋 headers、完整 body download、ZIP 解壓及 CSV 解析。只接受

`application/zip`、`application/octet-stream`；Content-Type

缺失、`response.body === null`、超限、逾時或非法 UTF-8 均令此附加

來源 unavailable。壓縮及解壓後大小分開設限；

超限時同時 cancel reader 及 abort request。



時間或座標非法、混合更新時間、找不到四段、所選代表格點必要 period

缺少／重複／雨量非法均為致命。座標合法但非任何代表格點的非法雨量、

服務範圍外非法雨量、額外合法時段或未知資料列屬可恢復問題，記入

`SourceMeta.issues`，不令完整代表格點失效。自動測試只用本地、由實際

官方回應抽取及去識別的 fixture，不呼叫 live endpoint。



\## Implementation rules



\- Fetch government APIs through server-side routes.

\- Set request timeouts.

\- Parse and validate responses.

\- Never assume optional fields exist.

\- Preserve raw timestamps.

\- Convert displayed times to Hong Kong time.

\- Add a server-side cache to avoid unnecessary repeated requests.

\- Automated tests must use local fixtures, not live API calls.

\- Record the retrieval time separately from the source publication time.

