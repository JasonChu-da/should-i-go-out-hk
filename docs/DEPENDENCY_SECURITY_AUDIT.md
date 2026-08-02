# Dependency Security Audit

## 2026-08-02 follow-up

本次 production-readiness audit 已處理先前仍留在 dependency tree 的高嚴重度 advisories：

- `next@16.2.12` 仍固定帶入 `postcss@8.4.31`，因此以 npm override 鎖定已修補的 `postcss@8.5.25`。
- Next 的 optional dependency range 仍停留在 `sharp@^0.34.5`，因此以 npm override 鎖定已修補的 `sharp@0.35.3`。
- `npm audit fix` 在既有 semver 範圍內把 `brace-expansion` 更新至 `1.1.18` 與 `5.0.9`，沒有使用 `--force` 或降級套件。
- `npm audit` 與 `npm audit --omit=dev` 均回報 0 vulnerabilities。
- `lint`、`typecheck`、374 項單元／整合測試、production build、14 項主要 E2E 與 7 項 PWA E2E 全部通過。

這兩項 override 是暫時性風險控制；待 Next.js 穩定版本直接依賴相容且已修補的版本後，應移除 override 並重新執行完整品質閘門。

調查日期：2026-07-27

調查基準：`ebc1b93a7ca90fc40ee3a5a7f518287a3e32bc02`

Node.js／npm：`v24.13.1`／`11.8.0`

## 範圍與保證

本次只執行唯讀調查，沒有執行 `npm audit fix`、`npm audit fix --force`、套件升級、dependency 刪除／替換或 lockfile 修改。

實際執行：

- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm outdated --json`
- `npm ls --depth=0`
- `npm ls <受影響套件> --all`
- `npm ls next postcss sharp --omit=dev --all`
- `npm view` 查核官方 registry 的目前版本、dependency ranges 與候選修復版本
- 搜尋專案是否使用 Middleware／Proxy、Server Actions、rewrites、`next/image`、不受信任 CSS 或影像輸入

首次 sandbox 內的 `npm audit` 因網絡權限被拒而失敗；取得 registry 權限後，所有 audit／outdated／metadata 查詢均成功。調查後 Git tracked files 與 `package-lock.json` 沒有被 npm 指令修改。

## 摘要

| 範圍 | High | Moderate | Low | Critical |
| --- | ---: | ---: | ---: | ---: |
| 全部 dependencies | 12 | 0 | 0 | 0 |
| `--omit=dev` | 3 | 0 | 0 | 0 |
| 只限 dev dependency tree | 9 | 0 | 0 | 0 |

重要解讀：

- 「12 high」是 npm audit 的 12 個受影響 package records，不等於 12 個互相獨立、全部可從本網站遠端觸發的漏洞。
- 9 個 dev-only records 全部沿 ESLint／`eslint-config-next` 工具鏈回溯至同一組 `minimatch`／`brace-expansion` 問題。
- 3 個 production records 是 direct `next`，以及經 `next` 帶入的 transitive `postcss` 和 optional `sharp`。
- `next@16.2.10` 是唯一直接出現在 production server 的受影響 dependency。`postcss` 主要是 build-time CSS processor；`sharp` 是 optional server-side image processor。兩者都不會進入瀏覽器 bundle。

## 12 個 package records

| 套件與目前版本 | 嚴重度 | Direct／transitive | 只限 dev | Production bundle／server | 官方／audit 修復方向 | Breaking change | 優先級與現階段判斷 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `next@16.2.10` | High | Direct production | 否 | 是；框架 server runtime，亦產生 client runtime，但本批 advisories 主要是 server 行為 | Next.js 官方 security release 最低建議 `16.2.11`；目前 registry 最新及 npm audit 建議為 `16.2.12` | 否，16.2.x patch | **P0／優先處理**。建議在下一次部署前以獨立變更升至 `16.2.12` 並跑全套驗證；沒有證據顯示目前網站已被攻擊 |
| `postcss@8.4.31` | High | Transitive：`next -> postcss` | 否 | 安裝於 production dependency tree；主要在 build-time 使用，不進入瀏覽器 bundle，現有 route 沒有 runtime CSS processing | 三項 advisories 的完整安全下限是 `postcss >=8.5.18` | 8.4→8.5 不是 major，但 Next 目前精確 pin `8.4.31`，強制 override 有相容風險 | **P1／追蹤上游**。目前沒有不受信任 CSS 輸入，未見可由網站訪客觸發的路徑；不建議未經測試直接 override |
| `sharp@0.34.5` | High | Optional transitive：`next -> sharp` | 否 | 可安裝於 production server；不進入瀏覽器 bundle | Patched `0.35.0`；advisory 目前建議 `0.35.3` | **可能**；0.x 的 0.34→0.35 可包含 breaking change，而且 Next 的 `^0.34.5` 不接受 0.35.x | **P1／追蹤上游**。專案沒有 `next/image`、圖片設定、`public/` 圖片或影像上載；目前沒有處理不受信任影像 |
| `eslint@9.39.5` | High | Direct dev | 是 | 否 | npm audit 建議 `eslint@10.8.0` | **是，major**；而且單獨升級仍未消除 plugins 的舊 `minimatch` tree | **P2／不阻擋部署**。只處理 repository source；不應自動 major upgrade |
| `eslint-config-next@16.2.10` | High | Direct dev | 是 | 否 | npm audit 提議 `0.2.4`，但這是錯誤方向的 major downgrade；registry 最新 `16.2.12` 的相關 plugin ranges 與目前相同，不能證明已修復 | audit 提議屬重大且不合理的版本變更 | **P2／監察**。不要採用 audit 的 `0.2.4` 建議；等候相容的上游 dependency 更新 |
| `@eslint/config-array@0.21.2` | High | Transitive：`eslint -> @eslint/config-array -> minimatch` | 是 | 否 | npm audit 透過 `eslint@10.8.0` 建議修復；目前 package 最新為 `0.23.5` | Top-level ESLint major | **P2／監察**。沒有 production 風險 |
| `@eslint/eslintrc@3.3.6` | High | Transitive：`eslint -> @eslint/eslintrc -> minimatch` | 是 | 否 | npm audit 透過 `eslint@10.8.0` 建議修復；`3.3.6` 已是目前 registry 最新 | Top-level ESLint major | **P2／監察**。沒有 production 風險 |
| `eslint-plugin-import@2.32.0` | High | Transitive：`eslint-config-next -> eslint-plugin-import -> minimatch` | 是 | 否 | audit 的 umbrella 建議會把 `eslint-config-next` 降至 `0.2.4`，不可採用；`2.32.0` 已是目前 registry 最新 | 尚無可核實的相容修復 | **P2／監察上游**。沒有 production 風險 |
| `eslint-plugin-jsx-a11y@6.10.2` | High | Transitive：`eslint-config-next -> eslint-plugin-jsx-a11y -> minimatch` | 是 | 否 | audit 的 umbrella 建議會把 `eslint-config-next` 降至 `0.2.4`，不可採用；`6.10.2` 已是目前 registry 最新 | 尚無可核實的相容修復 | **P2／監察上游**。沒有 production 風險 |
| `eslint-plugin-react@7.37.5` | High | Transitive：`eslint-config-next -> eslint-plugin-react -> minimatch` | 是 | 否 | 同上；`7.37.5` 已是目前 registry 最新 | 尚無可核實的相容修復 | **P2／監察上游**。沒有 production 風險 |
| `minimatch@3.1.5` | High | Transitive；由 ESLint 及三個 plugins 共用 | 是 | 否 | audit 的 affected range 為 `2.0.0–10.0.2`；最新 `10.2.5` 已越過該 range，但仍須配合 `brace-expansion@5.0.8` | **是，3→10 major**；不能在舊 parent ranges 下直接替換 | **P2／監察上游**。攻擊者不能從產品 UI 提交 glob pattern |
| `brace-expansion@1.1.16`、`5.0.7` | High | Transitive：`minimatch -> brace-expansion` | 是 | 否 | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) 的 patched version 是 `5.0.8` | `5.0.7→5.0.8` 是 patch；`1.1.16→5.0.8` 是 major，而且舊 parent range 不接受 | **P2／監察上游**。可造成 lint／CI availability 問題，但不在 deployed server tree |

## Production findings

### 1. Next.js

`next@16.2.10` 的 audit record 聚合四項 High 與五項 Moderate advisories：

High：

- [Middleware／Proxy bypass](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
- [Server Actions denial of service](https://github.com/advisories/GHSA-m99w-x7hq-7vfj)
- [Server Actions on custom servers SSRF](https://github.com/advisories/GHSA-89xv-2m56-2m9x)
- [Attacker-controlled rewrite destination SSRF](https://github.com/advisories/GHSA-p9j2-gv94-2wf4)

Moderate：

- [Request-body cache confusion](https://github.com/advisories/GHSA-68g3-v927-f742)
- [Invalid UTF-8 request-body cache confusion](https://github.com/advisories/GHSA-4633-3j49-mh5q)
- [Unbounded Server Action payload in Edge runtime](https://github.com/advisories/GHSA-4c39-4ccg-62r3)
- [Image Optimization API SVG denial of service](https://github.com/advisories/GHSA-q8wf-6r8g-63ch)
- [Internal Server Function endpoint disclosure](https://github.com/advisories/GHSA-955p-x3mx-jcvp)

實際專案核對：

- 使用 App Router，但沒有 `middleware.*`、`proxy.*` 或 i18n 設定。
- 沒有 `"use server"`／Server Actions。
- 沒有 custom server。
- `next.config.ts` 沒有 rewrites；只有 `reactStrictMode` 與停用 `poweredByHeader`。
- 唯一 Route Handler 是 `GET /api/outlook`，使用預設 Node runtime，沒有 Edge runtime。
- 沒有 `next/image`、`<Image>`、images config、`public/` 圖片或圖片 URL。

因此，現時沒有找到上述 feature-specific exploit prerequisites。不過 `next` 是直接、會在 production server 執行的框架 dependency，而且官方已有同 major patch，仍應列為最高處理優先級。這是「應儘快安排安全 patch」，不是「已證明網站可被直接攻擊」。

### 2. PostCSS

實際受影響的是 `next` 精確帶入的 `postcss@8.4.31`；Vite 下面另有安全的 `postcss@8.5.19`，不屬這個 audit node。

相關 advisories：

- [XSS via unescaped `</style>`](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)：patched `8.5.10`
- [Attacker-controlled `sourceMappingURL` arbitrary file read](https://github.com/advisories/GHSA-6g55-p6wh-862q)：patched `8.5.12`
- [`sourceMappingURL` path traversal／`.map` disclosure](https://github.com/advisories/GHSA-r28c-9q8g-f849)：patched `8.5.18`

三項全部清除需要 `postcss >=8.5.18`。專案不接受使用者文字或 CSS，上游只在 build 時處理 repository 內的 `app/globals.css`，沒有把不受信任 CSS 傳入 PostCSS 的 server route，因此目前可利用性低。

需注意：`npm audit` 把 `next@16.2.12` 列作 umbrella fix，但 registry metadata 顯示 `next@16.2.12` 仍精確依賴 `postcss@8.4.31`。因此不能假設只升 Next 就一定清除 PostCSS record；升級後必須重新執行 audit，並等待 Next 發布帶入安全 PostCSS 的版本，或另行評估經完整測試的 override。

### 3. sharp／libvips

[GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) 聚合四項 libvips CVE，影響處理不受信任輸入的 `sharp <0.35.0`；patched version 是 `0.35.0`，advisory 目前建議 `0.35.3`。

本專案的 `sharp@0.34.5` 是 Next optional dependency。專案沒有任何影像功能或影像輸入，現時沒有可由網站訪客觸發的處理路徑。另需注意 `next@16.2.12` 的 metadata 仍是 `sharp: ^0.34.5`，不會解析至 0.35.x；應等待 Next 的相容更新，不應無測試強制跨 0.x minor。

## Dev-only ESLint chain

實際 dependency paths：

```text
eslint@9.39.5
├─ @eslint/config-array@0.21.2 ─┐
├─ @eslint/eslintrc@3.3.6 ──────┼─ minimatch@3.1.5
└─ minimatch@3.1.5 ─────────────┘  └─ brace-expansion@1.1.16

eslint-config-next@16.2.10
├─ eslint-plugin-import@2.32.0 ─────┐
├─ eslint-plugin-jsx-a11y@6.10.2 ───┼─ minimatch@3.1.5
├─ eslint-plugin-react@7.37.5 ───────┘  └─ brace-expansion@1.1.16
└─ typescript-eslint@8.64.0
   └─ minimatch@10.2.5
      └─ brace-expansion@5.0.7
```

`brace-expansion` advisory 需要 application 把 attacker-influenced brace／glob pattern 交給 expansion。這個專案只用 ESLint 處理 repository source，沒有把產品訪客輸入送進 lint 或 glob。即使 CI 對外部 PR 執行，workflow 也只有 `contents: read`、沒有 secrets；主要剩餘風險是惡意或異常 pattern 令 lint worker OOM，而不是 production 網站 compromise。

現時沒有乾淨的相容修復組合：

- `eslint@10.8.0` 是 major upgrade。
- `eslint-config-next@16.2.12` 的相關 plugin ranges 與 16.2.10 相同。
- 三個受影響 plugins 已是 registry 最新版本。
- npm audit 建議把 `eslint-config-next` 改為 `0.2.4`，這是明顯不合適的舊 major，不應執行。
- `brace-expansion@5.0.8` 可修復 5.x branch，但舊 `minimatch@3.1.5` 的 `^1.1.7` range 無法接受它。

結論是保留現況並監察 ESLint／Next lint stack 上游，待發布相容版本後以獨立 dependency change 處理；現階段不應因 audit 數字盲目 major upgrade 或強制 lockfile override。

## `npm outdated` 的其他結果

以下只是版本落後，不是本次 12 個 High records 的證據：

- `@types/node`：24.13.3；latest 26.1.1
- `react`／`react-dom`：19.2.7；latest 19.2.8
- `typescript`：5.9.3；latest 7.0.2

本次沒有升級它們。

## 建議處理順序

1. **下一個獨立變更優先測試 `next` 與 `eslint-config-next` 16.2.12 patch**，執行 lint、typecheck、coverage、build、E2E 及兩種 audit；不要用 `npm audit fix`。這主要清除 Next framework advisories，但預期仍須單獨追蹤 PostCSS／sharp。
2. **追蹤 Next stable release 何時帶入 `postcss >=8.5.18` 與 `sharp >=0.35.0`**。在沒有不受信任 CSS／影像處理的現況下，不需要停站或緊急 override；加入這些功能前必須先修復。
3. **監察 ESLint ecosystem 對新 `brace-expansion` advisory 的上游更新**。待 `eslint-config-next` 及 plugins 提供相容 dependency tree 後，再評估 ESLint 10 major migration。
4. 如未來加入 Middleware／Proxy、Server Actions、rewrites、Edge runtime、圖片最佳化、CSS 上載或任何使用者文字處理，必須立即重新評估 reachability，不能沿用本報告的低可利用性判斷。

## 已知限制

- 本次沒有在 GitHub／Vercel 的實際 deployment artifact 內做 software composition scan；production 判斷來自 lockfile、`npm audit --omit=dev`、dependency tree 與原始碼 feature usage。
- npm advisories 與 registry metadata 在新漏洞發布後可能快速更新；本報告是 2026-07-27 的快照。
- `node_modules` 頂層另顯示六個不在 lockfile 的 extraneous optional WASM packages。它們不屬本次 12 個 records；CI 的 `npm ci` 會以 lockfile 建立乾淨環境。本次沒有刪除它們。
