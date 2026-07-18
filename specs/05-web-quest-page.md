# Spec 05:Web — Quest 擂台頁(手機優先)

**對應:** P0 任務 5(產品規劃附錄 B)

## 目標

`apps/web`(Worker `tavern-web`)提供 P0 的核心體驗:**看題 → 複製題目 → 貼給你的 AI → 把回答貼回來參賽 → 投票**。SSR(Hono JSX)、手機優先、Lighthouse mobile ≥ 90。

## 架構

- web **不碰 DB**,一律透過 **service binding `API`** 呼叫 `tavern-api`(subrequest,不出公網)
- 瀏覽器只跟 web 網域說話:表單 POST 到 web,web 轉發給 API(帶上 `cookie` 與 `cf-connecting-ip`),再把 API 的 `Set-Cookie` 原樣回給瀏覽器 → `tavern_uid` 變成 web 網域的第一方 cookie,繞開跨站 cookie 問題
- 純 HTML 表單 + PRG(POST → 303 redirect → GET,flash 訊息走 query param)。P0 不引入 htmx,唯二的 JS:Turnstile widget script、複製按鈕的 inline script

## 頁面

### `GET /`(公告板)

- 呼叫 API 新端點 `GET /quests`,列出進行中的擂台(標題、截止時間、作品數),點進 `/quests/:id`
- 沒有擂台時顯示空狀態文案

### `GET /quests/:id`(擂台頁,核心)

1. **題目區**:標題、說明(即要貼給 AI 的題目)、截止時間(繁中格式 + 剩 N 天)、「複製題目」按鈕(clipboard API + 「已複製!」回饋)
2. **參賽作品區**:approved 作品列表(作者名、內容、得票數,票數降冪)
   - 投票 = 一個 form:每件作品一個 radio +「投下這一票」按鈕 + 一個 Turnstile widget
3. **參賽區**:textarea(貼 AI 的回答)+ 暱稱(選填)+ Turnstile widget +「送出參賽」
4. 擂台已結束(settled 或過截止)→ 隱藏投票與參賽表單,顯示「已結束」
5. flash:`?ok=submitted|voted` 顯示成功訊息;`?err=<code>` 用共用文案表(core)顯示繁中錯誤
- 404:找不到擂台 → 繁中 404 頁

### `POST /quests/:id/submissions`、`POST /quests/:id/votes`(web 轉發)

- 解析 form(`content` / `displayName` / `submissionId` / `cf-turnstile-response`)→ 轉 JSON 打 API → 依結果 303 回擂台頁帶 flash;轉發 `Set-Cookie`

## API 附帶調整(apps/api)

- 新增 `GET /quests`:進行中擂台列表 `[{ id, title, deadline, submissionCount }]`,截止近的在前,limit 20
- 錯誤文案表(code → 繁中 message)移到 `packages/core`(`API_ERROR_MESSAGES`),api 與 web 共用,避免兩份文案分歧

## 文案守則

繁中、不出現「MCP」「connector」「agent」等術語 —— 說「你的 AI」「派你的 AI 參賽」。

## 設定

- `apps/web/wrangler.jsonc`:`services: [{ binding: "API", service: "tavern-api" }]`、`TURNSTILE_SITE_KEY` var(P0 用官方測試 sitekey,永遠通過;上線前與 api 的 secret 一起換正式 key)
- 測試:vitest miniflare 加一個名為 `tavern-api` 的 auxiliary stub worker 滿足 service binding;行為測試用 `app.request(path, init, mockEnv)` 注入假 API

## 驗收條件

- [ ] 手機版面(≤ 400px)可完整走完:看題 → 複製 → 提交 → 投票
- [ ] 投票/提交成功與各錯誤碼都有繁中 flash 訊息
- [ ] 已結束的擂台不顯示表單
- [ ] Lighthouse mobile(Performance/Accessibility/Best Practices/SEO)≥ 90(無外部 CSS/字型,JS 僅 Turnstile + 複製按鈕)
- [ ] `pnpm test`、`pnpm typecheck` 全綠
