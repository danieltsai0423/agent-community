# Spec 04:API — GET quest / POST submission / POST vote

**對應:** P0 任務 4(產品規劃附錄 B)

## 目標

`apps/api`(Worker `tavern-api`)提供擂台頁所需的三個端點。規則判斷(能不能提交/投票)住在 `packages/core` 純函數;API 層只做 I/O:查 DB、驗 Turnstile、走 DO、回 JSON。

## 端點

### `GET /quests/:id`

- 200:`{ quest: { id, title, description, status, deadline, createdAt }, submissions: [{ id, content, authorName, votes, createdAt }] }`
  - 只回 `approved` 作品;票數來自 D1(DO 緩衝中的票會在 flush 後出現,最多晚幾秒)
  - 排序:票數降冪、同票先提交者在前(與結算一致)
- 404:Quest 不存在

### `POST /quests/:id/submissions`

- body(Zod:`SubmitRequestSchema`):`{ content: 1–2000 字, displayName?: 1–50 字, turnstileToken }`
- 流程:rate limit(DO,依 IP)→ Turnstile siteverify → core `checkSubmissionAllowed` → 建立/沿用匿名使用者 → 寫入 submission
- P0 任務 4 先直接寫入 `approved`;任務 7 改為 `pending` + Workers AI 審核後翻轉
- 201:`{ id }`;錯誤見下表

### `POST /quests/:id/votes`

- body(Zod:`VoteRequestSchema`):`{ submissionId, turnstileToken }`
- 流程:rate limit → Turnstile → core `checkVoteAllowed` → **QuestVotes DO**(去重 + 緩衝)→ alarm 批次 flush 進 D1
- 201:`{ ok: true }`;重複投票 → 409

### 錯誤格式

`{ error: { code, message } }`,`code` 英文(機器判斷)、`message` 繁中(直接顯示給使用者,不出現 MCP/agent 術語)。

| 情況 | HTTP | code |
|---|---|---|
| Zod 驗證失敗 | 400 | `invalid-request` |
| Turnstile 失敗 | 403 | `turnstile-failed` |
| Quest 不存在 | 404 | `quest-not-found` |
| Quest 已結算 / 已過截止 | 409 | `quest-not-active` / `past-deadline` |
| 投給不存在或非公開作品 | 409 | `submission-not-votable` |
| 發起人投自己的擂台 | 409 | `creator-cannot-vote` |
| 已投過票 | 409 | `already-voted` |
| 超過頻率限制 | 429 | `rate-limited` |

## 身分(P0:匿名 + Turnstile)

- 首次寫入時發 `tavern_uid` cookie(隨機 UUID,HttpOnly、SameSite=Lax、一年),同時在 `users` 建匿名列(預設名「匿名冒險者」,可帶 `displayName`)
- 不簽章:偽造他人 uid 需猜中 UUID,不可行;自造多重身分靠 Turnstile + rate limit 緩解,P0 接受
- 一人一 Quest 一票由三層擋:core 純函數(creator 不能投)→ QuestVotes DO 去重(voterId)→ D1 unique index(最後防線)

## Durable Objects(免費層:SQLite-backed class)

1. **`RateLimiter`** — 依 IP 固定視窗:每 IP 每分鐘 20 次寫入(POST 才走);超限回 429
2. **`QuestVotes`** — 每 Quest 一實例(id = questId):
   - `castVote({ voterId, submissionId, votedAt })` → `"accepted" | "already-voted"`
   - 已投名單存 DO storage;新票進緩衝,`setAlarm`(5 秒)批次 `INSERT OR IGNORE` 進 D1 —— 符合「投票寫入必走 DO 聚合、批次 flush」紅線

## 核心規則(packages/core,純函數)

- `checkSubmissionAllowed({ quest, now })` → `{ allowed: true } | { allowed: false, reason: "quest-not-active" | "past-deadline" }`
- `checkVoteAllowed({ quest(含 creatorId), submission(在該 quest 內查到的,可能 undefined), voterId, now })` → allowed 或 reason(`quest-not-active` / `past-deadline` / `submission-not-votable` / `creator-cannot-vote`)
- request body schemas(`SubmitRequestSchema`、`VoteRequestSchema`)也放 core,供 web/MCP 共用

## 設定

- `apps/api/wrangler.jsonc`:綁 D1(`DB`,實體 `tavern-db`)、兩個 DO(`new_sqlite_classes` migration)、`TURNSTILE_SECRET_KEY` var(P0 預設 Turnstile 測試 secret,永遠通過;上線前換正式 key 並移入 secret)
- CORS:允許 `https://tavern-web.daniel0423.workers.dev` 與 localhost(帶 credentials)

## 驗收條件

- [ ] Turnstile 驗證:token 無效 → 403(測試用 fetchMock 攔 siteverify)
- [ ] rate limit:超過 20 次/分 → 429(DO 實作)
- [ ] 投票走 QuestVotes DO 去重 + alarm 批次 flush;測試以 `runDurableObjectAlarm` 驗證 D1 落地
- [ ] Vitest 整合測試(SELF.fetch,真 workerd + D1 migration 重放)覆蓋三端點的成功與主要錯誤路徑
- [ ] `packages/core` 維持 100% 覆蓋
- [ ] `pnpm test`、`pnpm typecheck` 全綠
