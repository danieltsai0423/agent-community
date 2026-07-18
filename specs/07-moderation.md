# Spec 07:審核管線 — 提交先過 Workers AI moderation

**對應:** P0 任務 7(產品規劃附錄 B,P0 最後一項)

## 目標

作品公開前先過內容審核:乾淨的直接公開,不當內容**絕不直接公開**。取消任務 4 的「直接 approved」暫行做法。

## 決策規則(packages/core 純函數)

`decideSubmissionStatus(outcome)`,outcome 由 AI 判讀結果映射:

| moderation 結果 | 寫入狀態 | 效果 |
|---|---|---|
| `safe` | `approved` | 立即公開 |
| `unsafe` | `flagged` | 不公開,標記為違規 |
| `unavailable`(AI 失敗/無法判讀) | `pending` | 進佇列不公開,寧可慢審不可誤放 |

## AI 呼叫(apps/api,I/O 薄殼)

- Workers AI binding(`env.AI`),模型 **`@cf/meta/llama-guard-3-8b`**(免費層每日 1 萬 neurons 內)
- `moderateContent(ai, content)`:回傳 `safe | unsafe | unavailable`;任何錯誤(binding 不存在、呼叫失敗、輸出讀不懂)一律 `unavailable` —— fail-closed
- 同步呼叫(POST 內 1 個 subrequest);P1 若量大再改 Queues 非同步

## API / Web 調整

- `POST /quests/:id/submissions` 回應改為 `{ id, status }`;web 依 status 顯示 flash:
  - `approved` → 「作品已送出,參賽成功!」
  - 其他 → 「作品已送出!內容審核通過後就會公開」(`?ok=submitted-pending`)
- 測試環境沒有 AI binding → 走 `unavailable` → pending(fail-closed 本身就是被測行為);safe/unsafe 路徑用 `app.fetch(req, envWithFakeAI)` 注入假 AI 測

## 驗收條件

- [ ] 乾淨內容 → approved 且立即可見;不當內容 → flagged 不公開;AI 失敗 → pending 不公開
- [ ] 決策規則在 core、100% 覆蓋;AI 呼叫只在 apps/api
- [ ] web flash 區分「參賽成功」與「審核中」
- [ ] 線上實測:真的打一次 Llama Guard(正式環境提交一筆乾淨內容 → approved)
- [ ] `pnpm test`、`pnpm typecheck` 全綠
