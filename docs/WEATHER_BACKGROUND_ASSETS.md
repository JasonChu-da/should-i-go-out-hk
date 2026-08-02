# 響應式天氣背景資產規格

## 矩陣與路徑

所有檔案均為高品質 WebP，置於 `/public/weather/scenes/{period}/`。每格有 `{scene}-desktop.webp` 及 `{scene}-mobile.webp` 兩張，共 42 張。

| 時段 | 場景檔名（各有 mobile／desktop） |
| --- | --- |
| `day` | `clear`、`cloudy`、`overcast`、`rain`、`storm`、`hot`、`neutral` |
| `dusk` | `clear`、`cloudy`、`overcast`、`rain`、`storm`、`hot`、`neutral` |
| `night` | `clear`、`cloudy`、`overcast`、`rain`、`storm`、`hot`、`neutral` |

方向規格：desktop 為 16:9 橫向構圖，mobile 為 9:16 直向構圖；手機天際線安排在約 60–70% 畫面高度。瀏覽器以 `<source media="(min-width: 64rem)">` 選 desktop，否則使用 mobile。

## 最終 prompt 組合

42 張圖均使用內建 `imagegen`。每張最終 prompt 由「共同鏡頭」＋「方向」＋「時段」＋「場景」四段組成；變體以相同時段／方向的 clear 圖作 editing reference，鎖定鏡頭、建築比例與水平線。

共同鏡頭：

> Photorealistic Victoria Harbour panorama viewed from Kowloon toward Hong Kong Island, same camera position, skyline geometry and scale, recognizable harbour water and mountains, deep depth of field, crisp fine architectural detail and natural micro-contrast. Generous uncluttered sky as a safe text area. No text, logo, watermark, people, foreground object, depth-of-field blur, motion blur, rain streak, lens droplet or lightning bolt.

方向增量：

- desktop：`Native 16:9 landscape composition; retain the full skyline, sky and harbour water with the horizon around 60–65% image height; no crop or zoom.`
- mobile：`Native 9:16 portrait composition; retain sky, skyline and harbour water with the skyline around 60–70% image height; no crop or zoom.`

時段增量：

- day：清晰自然日光與藍色／灰藍天空，不製造黃昏或夜間燈光。
- dusk：日落後的金橙至深藍漸變，城市燈光剛亮起，保留自然動態範圍。
- night：深藍黑天空、克制城市燈光及水面倒影，不把黑位壓成糊狀。

場景增量：

- clear：大部分天空清朗，只保留少量自然薄雲；沒有降雨或危險暗示。
- cloudy：破碎多層雲，仍可見部分天空；沒有降雨。
- overcast：連續低雲層、較冷較暗；沒有降雨或暴風暗示。
- rain：厚實含雨雲、潮濕薄霧及濕潤反光；雨線交由 UI 動畫。
- storm：高聳深色對流雲與強烈冷調反差；閃電及雨線交由 UI 動畫。
- hot：暖金／琥珀大氣與遠處輕微熱霧，建築仍保持銳利；沒有降雨。
- neutral：平衡、克制的天空與薄雲，不暗示晴朗、降雨、炎熱或危險。

## 輸出與驗收紀錄

- WebP：quality 92、smart chroma subsampling；轉檔沒有 resize。
- 42 個路徑均唯一且存在，總大小約 13.63 MiB；每次只下載當前場景及 viewport 所選方向。
- 內建生成器本輪實際原生輸出：desktop 1659–1660×948，mobile 941×1672。這低於原定 1792×1024／1024×1792，因此不標記最低像素門檻為完成，亦沒有用插值放大冒充原生輸出。
- 逐組 contact sheet 位於測試產物目錄，只供本機 QA，不納入產品或 Git。
