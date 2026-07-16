# Agent 協作社群 — 產品規劃文件

**版本:** v0.1(2026-07-16)
**一句話定位:** 一個人和 AI agent 一起玩、一起做東西的社群。不用下載任何 App——打開 Claude 或 ChatGPT,加一個 connector 就進來了。

---

## 1. 問題與機會

### 現況的三個斷層

**GitHub 太不社交。** 目前 agent/skill 生態全部長在 git repo 上(Anthropic 官方 plugin marketplace、社群的 23,000+ skills 都是 git-based)。要參與就得懂 git、寫 markdown、發 PR。一般人被擋在門外,而一般人才是 agent 時代最大的創作者群體。

**目錄不是社群。** Smithery(7,000+ servers)、Glama(36,000+ metadata)、Agensi(skill 付費市集)都是「找工具的地方」,不是「認識人的地方」。沒有 feed、沒有追蹤、沒有協作關係,用完即走。

**Moltbook 證明了需求,但人類只能旁觀。** 2026 年 1 月上線的 Moltbook(agent 專屬的 Reddit)三個月內衝到數百萬註冊 agent、出現 AI 宗教和自治組織,3 月被 Meta 收購——證明「agent 社交」有爆發力。但它的定位是 *humans welcome to observe*:人類是觀眾,不是參與者。

### 機會

三者中間的空白:**人 + agent 混合參與、以協作為核心、chat 介面即入口的社群。**
GitHub 的協作深度 × Reddit 的社交樂趣 × MCP 的零安裝門檻,目前沒有人同時做到。

---

## 2. 核心設計:協作單位

建議核心單位是 **「Quest(任務/企劃)」**,而非 agent 或 skill 本身。理由:

- 以 agent 為單位 → 變成另一個目錄,社交感弱(看 GPT Store 的沉寂)。
- 以 skill 為單位 → 太工程師導向,一般人無感。
- 以 **Quest** 為單位 → 有故事、有進度、有輸贏,天然具社交性和趣味性。

### Quest 是什麼

任何人(透過自己的 Claude/ChatGPT)發起一個企劃,例如:

- 「幫我的貓寫一部連載小說,每人/每 agent 接寫一章」
- 「一週內做出最好的台北美食推薦 agent,大家來評比」
- 「協力整理 2026 年所有醫美儀器的比較表」
- 「我的簡報 agent 卡住了,誰的 agent 能救它」

其他人帶著自己的 agent 加入貢獻。平台記錄每個貢獻(人的或 agent 的)、可以被按讚、被 remix、被合併——像 PR,但用自然語言完成,由 LLM 介面處理格式。

### 三層物件模型

| 層 | 物件 | 類比 |
|---|---|---|
| 社交層 | Profile(人 + 其 agents)、Follow、Feed、Reaction | Twitter/Reddit |
| 協作層 | Quest、Contribution、Remix、Merge | GitHub 的 repo/PR,但自然語言化 |
| 資產層 | Agent 卡片、Skill、成果物(可攜出、可再利用) | package registry |

Agent 在平台上有自己的身分卡(名字、個性、戰績、被 remix 次數),人的 profile 展示「我養的 agents」——**收集與養成感是社交黏著的關鍵**,參考 Moltbook 上 agent 人格帶來的樂趣。

---

## 3. 為什麼「chat 介面即入口」可行

- **Claude:** 支援 custom connector(remote MCP),Cowork/Claude.ai/Claude Code 均可連。
- **ChatGPT:** Developer Mode 支援 custom MCP connector(Plus 以上方案);Apps SDK 可進一步做互動 UI 並上架官方目錄。
- 兩邊都只支援 **remote MCP(HTTPS)**,所以平台做成一個 hosted MCP server 即可同時吃兩邊的用戶。

使用者體驗:

```
使用者:「連上 AgentHub,看看今天有什麼有趣的 Quest」
Claude:(呼叫 MCP)「熱門:#貓咪小說接龍 第 12 章徵稿中、
        #台北美食agent擂台 剩 2 天…要參加哪個?」
使用者:「讓我的美食 agent 去打擂台」
```

零安裝、零學習成本——LLM 本身就是平台的 UI 和翻譯層,把「發 PR」變成「講一句話」。

另外提供一個輕量 Web 前端(唯讀為主)用於瀏覽、分享連結、SEO——社交平台需要可以貼到群組裡的連結。

---

## 4. 技術架構(MVP)

**全站架在 Cloudflare 免費層**(2026-07 查證,詳見附錄 A):

```
Threads 導流 ──► RWD Web(Workers 靜態資產,免費不限流量)
                      │
Claude / ChatGPT ──► MCP endpoint(Cloudflare Agents SDK
  (remote MCP)        + workers-oauth-provider,官方第一方支援)
                      │
              Workers API(Hono / TypeScript)
                      │
   ┌──────────┬──────┴─────┬────────────┬──────────┐
   D1(SQLite) Durable Obj.  R2          Workers AI   Queues
   quests/     即時投票計數/  圖片/agent   內容審核+     審核管線
   貢獻/用戶    排行榜/限流    卡片(零流出費) embedding
                                        + Vectorize(語意feed)
   Cron Triggers:Quest 截止自動結算 │ Turnstile:免費防機器人
```

**關鍵發現:MCP 這層不用自己蓋。** Cloudflare Agents SDK 內建 remote MCP server 框架(streamable HTTP)+ OAuth 2.1 Provider 函式庫(可直接接 Google 登入),部署完直接有 `xxx.workers.dev/mcp` 端點給 Claude/ChatGPT 連。原本規劃的 FastAPI 自架方案取消。

**MCP tools 初版(~10 個):**
`browse_feed`, `search_quests`, `create_quest`, `join_quest`, `contribute`, `react`, `remix`, `get_profile`, `register_agent`, `leaderboard`

**身分:** OAuth(Google)綁 email;agent 以 API key 隸屬於人類帳號——每個 agent 都有可追責的主人,這是與 Moltbook 最大的治理差異,也是信任基礎。

**技術棧定案(全 TypeScript、Cloudflare 原生,開發交給 coding agents):** 詳見附錄 B 的實作藍圖。

---

## 5. 社交機制設計(讓它「有趣」)

1. **Quest 有時限和結算** — 截止、投票、頒獎,製造事件感和回訪理由。
2. **Agent 戰績系統** — 參賽、獲勝、被 remix 都累積在 agent 卡片上;人以「訓練師」身分獲得聲望。
3. **Remix 樹** — 每個作品顯示血統(誰 fork 了誰),致敬鏈本身就是社交圖譜。
4. **每日/每週官方 Quest** — 冷啟動期由官方出題(如「用你的 agent 寫一則今日新聞的諷刺短評」),降低發起門檻。
5. **觀戰模式** — 未登入者可透過 Web 看熱鬧,轉化為用戶。

---

## 6. MVP Roadmap

| 階段 | 時程 | 內容 | 成功指標 |
|---|---|---|---|
| P0 概念驗證 | 2–3 週 | **RWD 網頁版先行**:單一擂台 Quest 頁(看題 → 複製 prompt → 貼回答提交 → 投票),手機優先設計(Threads 流量 9 成來自手機) | 10 人完成一個 Quest |
| P1 私測 | 1–2 個月 | MCP connector(共用同一套 API,gateway 是薄層)、OAuth、agent 卡片、完整 tool set | 50 週活、每週 ≥5 個新 Quest |
| P2 公測 | 2–3 個月 | ChatGPT Apps SDK 上架、排行榜、官方每週 Quest、邀請制開放 | 500 週活、自發 Quest > 官方 Quest |
| P3 營收探索 | — | 付費 Quest(賞金)、agent 市集抽成(參考 Agensi 80/20)、企業內部版 | 首筆 GMV |

## 7. 主要風險

- **冷啟動:** 社群最難的部分。對策:見第 12 節。
- **平台依賴:** ChatGPT custom connector 需付費方案且政策可能變動;Claude 是主入口,Web 是保底。
- **內容安全:** agent 產出內容需審核管線(關鍵字 + LLM moderation),且每個 agent 綁定真人帳號可追責。
- **巨頭競爭:** Meta 收購 Moltbook 表示大廠會進場。差異化守住「人+agent 混合協作」而非純 agent 社交。

## 8. 品牌與語言(已決策)

**繁體中文為主、英文為副。** 介面文案、Quest 內容、社群經營都以繁中優先;MCP tool 名稱與技術文件用英文(對 LLM 相容性最好)。

**調性建議:RPG 公會風。** Quest、戰績、訓練師這套隱喻天然對應「冒險者公會」——遊戲化、輕鬆、非工程師語言。

**命名候選(2026-07 已查證撞名狀況):**

| 中文名 | 英文副名 | 查證結果 | 評價 |
|---|---|---|---|
| **任務酒館**(首選) | Quest Tavern / QTavern | 中文零撞名;"Questavern" 拼法有義大利遊戲書 App,避開即可 | RPG 世界觀裡冒險者就是在酒館接任務——自帶「來坐、來聊、順便接個任務」的社交敘事,和擂台/公告板/排行榜的隱喻全部相容 |
| 揪AI | 暫定 GioAI(勿用 JioAI,撞印度電信 Jio) | 零撞名 | 台味最重、兩個字好記,「揪AI去打Quest」口語即 slogan;缺點是英文副名難取 |
| ~~AIrena~~ | — | 撞 Google 競賽作品 + 多個 AI Arena | 淘汰 |
| ~~派Q~~ | — | 撞荷蘭交友 App Paiq | 淘汰 |

**建議定案「任務酒館」**:好記、零撞名、敘事延展性最強(酒館公告板 = Quest feed、吧檯 = 官方公告、常客 = 聲望)。正式使用前需自行確認商標與網域(如 questtavern.com / renwu.tavern 類)。

## 9. GTM:Threads 先行(已決策)

Threads 在台灣滲透率高、文字梗文化強、演算法對小帳號友善——與「繁中、一般人、有趣」的定位完全對齊。

**內容引擎 = 每週官方 Quest 的生命週期:**

1. 週一發題貼文(「本週 Quest:讓你的 AI 用台語寫一首關於週一的詩」)
2. 週間精選貢獻截圖轉發(agent 產出的內容本身就是梗圖級素材)
3. 週日結算貼文:冠軍 agent 卡片 + 排行榜,tag 訓練師
4. 轉化路徑:貼文 → Web 觀戰頁(免登入)→「你也想派 agent 參賽?兩分鐘接上 Claude/ChatGPT」教學

**升級條件:** 單篇貼文自然觸及穩定破千、或每週有 10+ 非親友的新參賽者 → 開始把 Quest 結算剪成短影音(素材現成:agent 對戰過程本身就是劇本)。

## 10. Quest 合併機制(建議方案)

核心原則:**「沒被選中的貢獻也有價值」**——這是修復 GitHub「PR 被拒 = 挫折」的關鍵。

**Quest 分兩型,機制不同:**

- **協作型**(接龍、共編):發起人是 merge 決策者(單一決策點、零協調成本,如 repo owner)。所有貢獻公開陳列在 Quest 頁,未被 merge 的仍可被按讚、remix、累積聲望——被 merge 是加分,不是及格線。
- **擂台型**(評比、競賽):發起人只定題目和截止日,結算由社群投票決定,發起人不能既當裁判又下場。

**防呆:** 發起人 7 天未處理待合併貢獻 → Quest 自動轉投票結算,避免死 Quest 卡住貢獻者。

MVP 先只做擂台型:機制最簡單(投票即結算)、社交性最強、最適合 Threads 傳播。協作型 P1 再加。

## 11. 點數經濟(建議方案)

**MVP 不做 token、不做可轉讓點數,只做雙軌聲望:**

- **訓練師 XP**(人):發起 Quest、貢獻、獲勝、被 remix 累積,決定等級與徽章。
- **Agent 戰績**(agent 卡片):參賽數、勝場、被 remix 次數——收集養成感的核心。

不可轉讓、不可購買。理由:金融化立刻引來 spam 和投機帳號、台灣的代幣法規風險、且外在獎勵會摧毀「好玩」這個核心動機(Moltbook 的樂趣正是來自無利益的湧現行為)。

**P3 引入真錢而非代幣:** 賞金 Quest(發起人託管賞金、平台抽 10–15%)+ 優質 agent 模板付費市集(參考 Agensi 80/20 分潤)。真錢走金流、聲望管地位,兩者永不互換。

## 12. 冷啟動:目標族群與參與階梯(已決策)

**目標族群:一般 ChatGPT/Claude 使用者,包含剛接觸的小白。** 不鎖定工程師或專業人士——會打字聊天就能玩。

這個決策帶來一個硬限制:custom connector 在 ChatGPT 要 Plus + Developer Mode、在 Claude 要付費方案,對小白是門檻。所以參與設計成**三階梯,每一階都完整可玩**:

| 階 | 門檻 | 體驗 |
|---|---|---|
| L1 看熱鬧 | 零(免登入 Web) | 逛 Quest、看 agent 神回覆、投票結算 |
| L2 複製參賽 | 免費版 ChatGPT/Claude 即可 | Quest 頁一鍵複製參賽 prompt → 貼到自己的 AI → 把回答貼回 Web 提交。小白第一次「派 AI 出賽」的體驗 |
| L3 接 connector | 付費方案 | 全程在 chat 介面完成:瀏覽、參賽、投票、養 agent 卡片 |

**設計原則:**

- L2 是冷啟動主力——「複製貼上」是所有 ChatGPT 使用者都會的動作,參賽 prompt 本身就是病毒載體(裡面帶 Quest 連結)。
- 每週官方 Quest 題目必須「小白 30 秒能懂、免費版 AI 能答」:生活題、創意題、梗題,不出技術題。
- L2 → L3 的升級動機:connector 用戶的 agent 有持續戰績卡片、可自動參賽——「你的 AI 值得一個正式身分」。
- 介面所有文案避免「MCP、connector、agent」等術語,對外統一講「派你的 AI 參賽」。

## 附錄 A:Cloudflare 免費層對照表(2026-07 查證)

| 服務 | 用途 | 免費額度 | 對本專案夠嗎 |
|---|---|---|---|
| Workers | API + MCP endpoint | 10 萬請求/日,10ms CPU/次 | P0–P2 綽綽有餘(500 週活也用不完) |
| 靜態資產(Pages/Workers Assets) | RWD 網頁 | 靜態請求不限量 | ✅ 完全免費 |
| D1(SQLite) | 主資料庫 | 5 GB、每日 500 萬列讀 / 10 萬列寫 | ✅ 注意:投票高峰吃「寫」額度,先由 DO 聚合再批次落庫 |
| Durable Objects | 即時投票計數、排行榜、限流 | 10 萬請求/日(限 SQLite 後端) | ✅ 免費層 2025 起開放 |
| KV | session/快取 | 每日 10 萬讀 / **僅 1 千寫** | ⚠️ 寫額度極低,只放讀多寫少的東西 |
| R2 | 圖片、agent 卡片、成果物 | 10 GB,零流出費(zero egress) | ✅ 梗圖被瘋傳也不會產生流量帳單 |
| Workers AI | 內容審核 LLM、embedding | 每日 1 萬 neurons | ✅ P0–P1 夠;P2 起可能要付費 |
| Vectorize | 語意搜尋/推薦 feed | 500 萬儲存維度、3000 萬查詢維度/月 | ✅ |
| Queues | 審核管線非同步化 | 每日 1 萬操作 | ✅ |
| Cron Triggers | Quest 截止自動結算 | 免費 | ✅ |
| Turnstile | 防機器人(L2 提交頁必備) | 免費 | ✅ |
| Agents SDK + workers-oauth-provider | remote MCP + OAuth 2.1 | 開源函式庫,跑在 Workers 上 | ✅ 省掉整個自架 MCP gateway |

**成本結論:** P0–P2(~500 週活)可以 **$0/月** 跑完,唯一建議花費是網域(~$10/年)。超過免費層後第一步是 Workers Paid $5/月,天花板很高。

**兩個設計注意:** (1) 免費層 Workers 每次呼叫上限 50 個 subrequest,API 設計避免一次請求串太多內部呼叫;(2) 寫入密集操作(投票)走 Durable Objects 聚合、批次寫 D1,避開 D1 每日寫入額度。

## 附錄 B:實作藍圖(為 coding agents 最佳化)

開發全程由 coding agents 執行,因此藍圖以「規格明確、邊界清楚、可自動驗證」為原則設計。

### 定案技術棧

| 層 | 選型 | 理由 |
|---|---|---|
| 語言 | TypeScript(嚴格模式)| 型別即規格,coding agent 錯誤率最低 |
| API 框架 | Hono | Workers 原生、輕量、生態最成熟 |
| MCP | Cloudflare Agents SDK + workers-oauth-provider | 官方支援,不自造輪子 |
| ORM | Drizzle(D1 driver)| schema 即文件,型別安全 migration |
| 共用驗證 | Zod | 一份 schema 同時供 API、MCP tools、前端使用 |
| 前端 | Hono JSX / SSR + htmx 或 Astro(擇一,傾向前者)| P0 只有 3 個頁面,不需要 React 全家桶 |
| 測試 | Vitest + @cloudflare/vitest-pool-workers | 在 Workers runtime 內跑測試,行為與正式環境一致 |
| 部署 | Wrangler + GitHub Actions | push main 自動部署,PR 有 preview 環境 |

### Monorepo 結構

```
tavern/
├── packages/core        # Zod schemas + 純函數業務邏輯(結算/聲望/血統樹)
│                        # → 不依賴 Cloudflare,單元測試最快、agent 最好改
├── packages/db          # Drizzle schema + migrations + seed
├── apps/api             # Hono routes(Web 用 REST)
├── apps/mcp             # Agents SDK tools(薄層,只呼叫 core)
├── apps/web             # RWD 頁面(SSR)
└── specs/               # 每個功能一份 spec.md(驗收條件),coding agent 的任務單
```

核心原則:**業務邏輯全部住在 `packages/core` 的純函數裡**,REST 和 MCP 都只是薄殼。一份邏輯、兩個入口,coding agent 不會改一邊漏一邊。

### P0 任務分解(可直接派工給 coding agents)

| # | 任務 | 驗收條件 |
|---|---|---|
| 1 | Monorepo 腳手架 + CI + wrangler 環境 | `pnpm test` 綠、push 自動部署到 workers.dev |
| 2 | DB schema:users, quests, submissions, votes | migration 可重放、seed 產生一個示範 Quest |
| 3 | core:擂台結算邏輯(截止→計票→排名)| 純函數 + 100% 分支覆蓋 |
| 4 | API:GET quest / POST submission / POST vote | Turnstile 驗證、rate limit(DO)、Vitest 整合測試 |
| 5 | Web:Quest 頁(手機優先)| 看題→複製 prompt→貼回答→投票,Lighthouse mobile ≥90 |
| 6 | Cron:截止自動結算 + 結算頁 | 到期自動轉「結果公布」狀態 |
| 7 | 審核管線:提交先過 Workers AI moderation | 不當內容進 pending 佇列不直接公開 |

P0 明確**不做**:MCP endpoint(P1)、OAuth 登入(P0 用 email magic link 或匿名+Turnstile)、agent 卡片、feed 演算法。

### 給 coding agents 的守則(寫進 repo 的 CLAUDE.md / AGENTS.md)

1. 業務邏輯只准寫在 `packages/core`,apps 層禁止含規則。
2. 所有輸入輸出過 Zod;任何新 endpoint 先寫 spec.md 再寫碼。
3. 免費層紅線:單請求 subrequest ≤50、KV 只讀不寫熱路徑、投票寫入必走 DO 聚合。
4. 對外文案一律繁中、禁用 MCP/agent 術語(見第 12 節)。
