# 政府 API 實測紀錄

實測日期：2026-07-14 20:02–20:17 HKT

本文件記錄實際 HTTP GET，而非只依文件推測。官方規格仍以 [HKO Open Data API 文件](https://www.hko.gov.hk/tc/weatherAPI/doc/files/HKO_Open_Data_API_Documentation_tc.pdf) 與 [AQHI dataset](https://data.gov.hk/en-data/dataset/hk-dpo-datagovhk2-city-dashboard-aqhi) 為準。

## 總覽

| 來源 | HTTP | Content-Type | 實測根結構 | 來源時間 |
| --- | ---: | --- | --- | --- |
| HKO `rhrread` | 200 | `application/json; charset=utf-8` | object | 多個分項時間＋`updateTime` |
| HKO `warnsum` | 200 | `application/json; charset=utf-8` | 動態鍵 object | 每項警告各有時間，無全域時間 |
| HKO `flw` | 200 | `application/json; charset=utf-8` | object | `updateTime` |
| AQHI individual | 200 | `application/json; charset=utf-8` | 18-item array | 每項 `publish_date` |

HKO 三個回應實測沒有 `Cache-Control`、`ETag`、`Last-Modified`；AQHI 回應有 `Cache-Control: no-cache`。應用會另記 `retrievedAt` 並自管短期 server cache。

## HKO 本港地區天氣報告：`rhrread`

實測頂層欄位：

`rainfall`、`warningMessage`、`icon`、`iconUpdateTime`、`uvindex`、`updateTime`、`temperature`、`tcmessage`、`mintempFrom00To09`、`rainfallFrom00To12`、`rainfallLastMonth`、`rainfallJanuaryToLastMonth`、`humidity`。

文件列出但本次完全缺失：`lightning`、`rainstormReminder`、`specialWxTips`。這證明頂層欄位不可視為必有。

### 雨量

- `rainfall = { data, startTime, endTime }`
- 本次有十八區 18 項，項目實際為 `{ unit, place, max, main }`。
- `max` 是 number，本次為 0；文件列出的 `min` 在全部項目均缺失。
- `main` 是 string：16 項為 `"FALSE"`，深水埗及九龍城為 `""`；不可轉成一般 truthy boolean。
- 地區名稱不一致地帶「區」字尾，必須用 canonical mapping。
- 時間：`startTime=2026-07-14T18:45:00+08:00`、`endTime=2026-07-14T19:45:00+08:00`。

### 氣溫、濕度、UV 與其他欄位

- `temperature = { data, recordTime }`，本次 26 站；項目 `{ place, value:number, unit:"C" }`，時間 `20:00 +08:00`。
- `humidity = { data, recordTime }`，本次只有香港天文台一項；時間 `20:00 +08:00`。
- `icon` 是 number array，本次 `[62]`；`iconUpdateTime=18:20 +08:00`。
- 夜間 `uvindex` 實際是空字串 `""`，不是 object；不可把它正規化為 UV 0。
- 有資料時，文件定義 UV object 含 `data`／`recordDesc`，項目可含 `place`、`value`、`desc`、`message`。
- `warningMessage` 本次是 string array；文件說無資料時可改為空字串。
- `tcmessage` 與數個累計雨量／最低溫欄位本次是空字串。
- 頂層 `updateTime=2026-07-14T20:02:00+08:00`。

## HKO 天氣警告一覽：`warnsum`

頂層是警告類別動態鍵。本次只有 `WMSGNL`：

```json
{
  "WMSGNL": {
    "name": "強烈季候風信號",
    "code": "WMSGNL",
    "actionCode": "ISSUE",
    "issueTime": "2026-07-14T18:20:00+08:00",
    "updateTime": "2026-07-14T18:20:00+08:00"
  }
}
```

可能頂層鍵包括 `WFIRE`、`WFROST`、`WHOT`、`WCOLD`、`WMSGNL`、`WRAIN`、`WFNTSA`、`WL`、`WTCSGNL`、`WTMW`、`WTS`。`code` 不一定等於頂層鍵：暴雨為 `WRAINA/R/B`，熱帶氣旋為 `TC1/3/8*/9/10`，火災危險為 `WFIREY/R`。

`type`、`expireTime` 可缺失；`actionCode` 可為 `ISSUE`、`REISSUE`、`CANCEL`、`EXTEND`、`UPDATE`。成功空 object 與請求失敗必須保留不同語義。

## HKO 本港地區天氣預報：`flw`

本次全部欄位均是 string：`generalSituation`、`tcInfo`、`fireDangerWarning`、`forecastPeriod`、`forecastDesc`、`outlook`、`updateTime`。

`tcInfo` 與 `fireDangerWarning` 實際為空字串。`updateTime=2026-07-14T19:45:00+08:00`。Parser 應接受文字欄位空白或缺失；預報不會被用來推斷精確即時雨量。

## AQHI individual

- 根為 array，本次 18 項、無 null、缺欄或重複站。
- 每項實際只有 `station:string`、`aqhi:integer number`、`health_risk:string`、`publish_date:string`。
- 本次 AQHI 為 2–3，風險均為 `Low`。
- 官方 data dictionary 把 `aqhi` 定義為 string 並容許 `1`–`10`、`10+`；runtime parser 必須同時接受實測 number、numeric string 與 `10+`。
- `health_risk` 合法值：`Low`、`Moderate`、`High`、`Very High`、`Serious`。
- `publish_date=2026-07-14T19:30:00`，沒有 offset；必須明確按 HKT `+08:00` 解析。
- 不可要求恆定 18 項，個別站點可能缺失。

一般站 15 個；`Causeway Bay`、`Central`、`Mong Kok` 是路邊站。地區模式採環保署的[官方代表地區對照](https://www.aqhi.gov.hk/tc/what-is-aqhi/about-aqhibc9c.html?start=2)，一般使用者不混入路邊站。

## 實作與 fixture 結論

- 先檢查 2xx 與 JSON Content-Type，再解析 body。
- Parser 接受未知欄位，排除 malformed item，保留 issues；根結構錯誤才令來源失敗。
- 保留 raw timestamp，另記 `retrievedAt`。
- 使用分項觀測時間判斷 weather freshness；無法解析、過時或明顯未來值不計分。
- Fixtures 會保留本次實測的夜間 UV 空字串、雨量 `min` 缺失、AQHI number、警告動態鍵與預報空白 optionals；另外建立可控的 daytime UV、severe warning、stale、missing、malformed 測試資料。

