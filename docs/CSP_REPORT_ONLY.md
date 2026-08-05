# Content Security Policy Report-Only 盤點

日期：2026-08-05
基準：`origin/main` commit `9dc94fd9f4d8e67beb4bf6851521c70b7d70c944`

## Production 實測範圍

以 `npm run build`、`npm run start -- -p 3300`、Chromium 及 WebKit 檢查首頁、活動模式、地區浮層、動態背景開關、manifest、Service Worker、內部 API 及全部 42 張背景圖。

- 所有 browser resource request 均為目前網站 origin。
- 首頁 HTML 有 16 個 script tag，其中 5 個是 inline；沒有 style tag，SSR 有 16 個 style attribute，hydration 後有 23 個。
- JavaScript 與 CSS bundle 位於 `/_next/static/`。
- Browser 只 fetch 同源 `/api/outlook?location=...`；HKO、AQHI 及降雨 ZIP 全由 server fetch，不屬於 browser `connect-src`。
- 圖片只有 `/icons/` 及 `/weather/scenes/{day|dusk|night}/...`；42 張 WebP 全部成功解碼。
- CSS 沒有 `url()` 或 `@font-face`；字型是系統 font stack，沒有 font request。
- Service Worker 是 `/sw.js`，只處理同源 navigation、API、icons 及 `/_next/static/`。
- Manifest 是 `/manifest.webmanifest`；沒有 Web Worker、WebSocket、EventSource、iframe、object、embed、media、analytics 或第三方 script／font。
- Geolocation 只在 browser memory 使用；它由既有 `Permissions-Policy: geolocation=(self)` 管理，不需要額外 CSP source。
- 香港天文台及 AQHI 連結只在使用者點擊後導覽至新分頁，不是嵌入資源。

## 既有 security headers

加入 CSP 前，`/`、manifest、`/sw.js`、`/api/outlook` 及背景圖片均已有：

| Header | 值／狀態 |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` |
| `Strict-Transport-Security` | 本機 HTTP response 沒有；本輪不改動 |

`frame-ancestors 'none'` 與現有 `X-Frame-Options: DENY` 一致；本輪保留兩者以兼容不同 browser。

## 最終 Report-Only policy

```text
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'none'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; media-src 'none'; frame-src 'none'
```

所有 route 都帶有 `Content-Security-Policy-Report-Only`；沒有加入強制 `Content-Security-Policy`。本階段沒有 remote CSP report collector；Report-Only 違規只能透過本機或自動瀏覽器測試的 console 觀察。

| Directive | 設定理由 |
| --- | --- |
| `default-src 'self'` | 未個別列出的資源以同源為安全預設。 |
| `script-src 'self' 'unsafe-inline'` | Bundle 同源；Next.js hydration、layout 初始偏好及 offline page 有實測 inline script。 |
| `style-src 'self' 'unsafe-inline'` | CSS bundle 同源；React 元件有實測 style attribute。 |
| `img-src 'self'` | Icons 及 42 張背景全部同源；沒有 `data:` 或 `blob:` image。 |
| `font-src 'none'` | 只用系統字型，production 沒有 font request。 |
| `connect-src 'self'` | Browser 只連 `/api/outlook`；政府來源是 server-side fetch。 |
| `worker-src 'self'` | `/sw.js` 是唯一 worker。 |
| `manifest-src 'self'` | Manifest 位於同源 `/manifest.webmanifest`。 |
| `object-src 'none'` | 網站沒有 object 或 embed。 |
| `base-uri 'none'` | 網站沒有 base element。 |
| `frame-ancestors 'none'` | 產品不需要被嵌入；與 `X-Frame-Options: DENY` 一致。 |
| `form-action 'none'` | 網站沒有 form submission。 |
| `media-src 'none'` | 網站沒有 audio 或 video。 |
| `frame-src 'none'` | 網站沒有 iframe。 |

Development 只在 `script-src` 額外加入 `'unsafe-eval'`，並把 `font-src` 設為 `'self'`，因為 Next.js dev server 實測會載入同源 `__nextjs_font` Geist 字型；production 沒有這些字型請求，仍維持 `font-src 'none'` 並由自動測試固定。

日後只有在建立有界限、重視私隱且具實際監控用途的 collector 時，才加入 `report-to` 或 `report-uri`；不應保留只丟棄資料、卻消耗 Function 請求的 endpoint。

## 已知妥協與違規分類

- `unsafe-inline`：production 的 `script-src` 及 `style-src` 都有使用；這不是嚴格 CSP。移除它需要另行設計 nonce／hash，不能直接切換強制模式。
- `unsafe-eval`：production 沒有；development 有。
- `data:`、`blob:`、通配符及外部 resource domain：全部沒有。
- 最終 Chromium：0 個 `securitypolicyviolation`、0 個 console error／warning。
- 最終 WebKit：0 個網站資源造成的 `securitypolicyviolation`；只排除沒有 collector 時由 WebKit 固定產生的 Report-Only `report-to` 提示，其他 console error 仍會令 E2E 失敗。
- Development 首輪 WebKit E2E 曾回報四個 `font-src` 違規：`/__nextjs_font/geist-latin-ext.woff2`、`geist-mono-latin-ext.woff2`、`geist-latin.woff2`、`geist-mono-latin.woff2`。它們只由 Next.js dev server 產生；development 改為 `font-src 'self'` 後 52 項 E2E 全部通過，production 仍是 `font-src 'none'`。
- 沒有 remote report destination 時，瀏覽器可能提示 Report-Only policy 沒有回報目的地；本階段接受該提示並以本機及自動瀏覽器測試的 console 觀察違規。
- 網站本身、Playwright 注入、開發工具或擴充功能造成而需要放寬的 production 違規：沒有。
- 實測中 Chromium 曾在切換地區時取消一個 Next.js RSC request；它是正常的同源 request cancellation，不是 CSP violation，沒有據此放寬政策。

目前只能證明這個 Report-Only policy 與已測流程相容；在移除 `unsafe-inline` 並再次完成 production 驗證前，不應改成強制 CSP。

## 完整驗證

- `npm ci`：401 packages，0 vulnerabilities。
- `npm run lint`、`npm run typecheck`：通過。
- `npm test`、`npm run test:coverage`：21 files、432 tests 通過；coverage threshold 沒有修改。
- `npm run build`：通過，且 `/api/csp-report` 不存在。
- `npm run test:e2e`：Chromium 26 項、WebKit 26 項，共 52 項通過。
- `npm run test:e2e:pwa`：production Chromium 10 項通過，包括 manifest、Service Worker、offline、header paths 及確認 report endpoint 不存在。
- `npm audit`：0 vulnerabilities。
- `git diff --check`：通過。
