# Spec 06:Cron 截止自動結算 + 結算頁

**對應:** P0 任務 6(產品規劃附錄 B)

## 目標

擂台到期後自動結算(計票 → 排名 → 發布結果),擂台頁轉為「結果公布」。結算規則**只用**任務 3 的 `settleArenaQuest`(core 純函數);Cron 只是薄殼。

## DB 變更(migration 0001)

- `quests.settled_at`(timestamp,nullable)— 結算時間
- `submissions.final_rank`、`submissions.final_votes`(integer,nullable)— 結算時寫入的名次與票數,**結果一經發布即不可變**,之後讀取不再重算

## Cron(掛在 tavern-api)

- `triggers.crons = ["*/5 * * * *"]`(免費層可用;截止後最晚 5 分鐘內結算)
- `scheduled` handler → `settleDueQuests(env, now)`:
  1. 撈 `status = active AND deadline <= now` 的擂台(單次最多 10 個,守 subrequest 紅線)
  2. 先叫該擂台的 QuestVotes DO `flush()`(把還在緩衝的票寫進 D1 再計票)
  3. 讀 submissions + votes → `settleArenaQuest` → `db.batch`:quest 轉 `settled` + `settled_at`,各 approved 作品寫入 `final_rank` / `final_votes`
- 冪等:query 只撈 active;`settleArenaQuest` 本身也擋 already-settled

## API 調整

- `GET /quests/:id`:submissions 增加 `rank`(未結算為 null);已結算時 `votes` 用 `final_votes`、排序改依 `rank` 升冪(同名次先提交者在前)

## Web 結算頁

- 已結算:標題區顯示「結果公布」;作品列表顯示名次(第 N 名),第 1 名且至少一票的作品掛 🏆 徽章;無表單
- 全場零票:顯示所有作品、無冠軍(文案:「這次沒有人投票,冠軍從缺」)

## 驗收條件

- [ ] 到期擂台在 cron 執行後自動轉「結果公布」(scheduled handler 整合測試:含 DO 緩衝票 flush 後才計票的端到端路徑)
- [ ] 結算寫入 final_rank / final_votes,GET 依名次回傳
- [ ] 結算邏輯零重複:apps 層不含計票/排名規則
- [ ] migration 可重放;正式 D1 已套用
- [ ] `pnpm test`、`pnpm typecheck` 全綠
