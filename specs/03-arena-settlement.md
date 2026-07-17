# Spec 03:擂台結算邏輯(截止 → 計票 → 排名)

**對應:** P0 任務 3(產品規劃附錄 B)

## 目標

`packages/core` 的純函數 `settleArenaQuest`:給定 Quest、作品、投票與當下時間,產出結算結果。無 Cloudflare 依賴;Cron(任務 6)與 API 只是呼叫它的薄殼。

## 規則

1. **前置檢查**
   - Quest 已是 `settled` → 不結算,回 `{ settled: false, reason: "already-settled" }`(冪等:Cron 重跑不會重複結算)
   - 還沒到 `deadline`(`now < deadline`)→ 回 `{ settled: false, reason: "not-due" }`
2. **有效票**
   - 只有投給 `approved` 作品的票有效(投給 pending/flagged/不存在的作品 → 無效票,直接忽略)
   - 一人一票:同一 voter 有多張票時只算**最早**那張(DB 有 unique 約束擋住,但純函數自我防衛)
3. **計票與排名**
   - 只有 `approved` 作品參與排名
   - 依票數降冪;平手用 standard competition ranking(1, 2, 2, 4)——同票同名次
   - 同名次的顯示順序:先提交者在前(deterministic)
4. **冠軍**
   - `winners` = 名次 1 且**至少一票**的作品;全場零票 → 無冠軍(`winners: []`)
   - 零件作品 → `ranking: []`、無冠軍

## 介面

- 輸入/輸出型別由 Zod schema 定義並匯出(`ArenaSettlementInputSchema`),供 API/MCP 邊界驗證
- 函數本身吃已驗證的型別,不在內部重複 parse
- 回傳 discriminated union:`{ settled: false, reason }` | `{ settled: true, ranking, winners }`

## 附帶調整

- 移除腳手架期的示範函數 `tallyVotes`(語意是「一人對一件作品一票」,與擂台的「一人一 Quest 一票」不一致,留著會誤導)——結算是唯一的計票實作。

## 驗收條件

- [ ] 純函數、無 Cloudflare 依賴
- [ ] `packages/core` 對 `src/**` 強制 100% 覆蓋(branches/lines/functions/statements),未達標測試直接紅
- [ ] 規則 1–4 各有對應測試(冪等、未到期、無效票、重複投票、平手、零票、零作品)
