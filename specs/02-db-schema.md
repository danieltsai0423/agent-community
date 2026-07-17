# Spec 02:DB schema(users, quests, submissions, votes)

**對應:** P0 任務 2(產品規劃附錄 B)

## 目標

用 Drizzle 定義 D1(SQLite)的核心資料表,產出可重放的 migration 與 seed。

## 資料模型

### users

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | text PK | UUID |
| email | text nullable, unique | P0 用 magic link 或匿名,匿名者為 null |
| display_name | text not null | 顯示名稱 |
| created_at | integer(timestamp) not null | |

### quests

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | text PK | UUID |
| creator_id | text FK→users.id | 發起人(不能投票裁決,只定題目與截止日) |
| type | text not null, default 'arena' | P0 只有擂台型;協作型 P1 |
| title | text not null | 題目 |
| description | text not null | 題目說明 + 參賽 prompt(L2 複製用) |
| status | text not null, default 'active' | 'active' → 'settled'(Cron 結算後) |
| deadline | integer(timestamp) not null | 截止時間,Cron 據此結算 |
| created_at | integer(timestamp) not null | |

### submissions

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | text PK | UUID |
| quest_id | text FK→quests.id | |
| author_id | text FK→users.id | |
| content | text not null | 參賽作品(自然語言) |
| status | text not null, default 'pending' | 審核管線:'pending' → 'approved' / 'flagged';只有 approved 公開 |
| created_at | integer(timestamp) not null | |

### votes

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | text PK | UUID |
| quest_id | text FK→quests.id | 冗餘欄位,為了唯一約束與查詢 |
| submission_id | text FK→submissions.id | |
| voter_id | text FK→users.id | |
| created_at | integer(timestamp) not null | |

**約束:`unique(quest_id, voter_id)`** —— 一人一 Quest 一票(擂台投「最喜歡的一件作品」)。改票 = 先刪再投,P0 不做改票 UI。

## 設計註記

- 投票高峰的寫入走 Durable Object 聚合、批次寫 D1(任務 4);本表是最終落庫格式。
- seed 產生:一個示範用戶 + 一個進行中的示範 Quest(繁中生活題)+ 兩件已核可的示範作品。
- seed 寫成純函數 `seedDemo(db)`(吃 Drizzle D1 實例),測試與之後的環境初始化共用。

## 驗收條件

- [ ] `drizzle-kit generate` 產出的 migration 在乾淨 D1 上可完整重放(測試內用真 D1/workerd 驗證)
- [ ] seed 後可查回示範 Quest 與其 approved 作品
- [ ] 唯一約束生效:同一人對同一 Quest 投第二票會被拒
- [ ] `pnpm test`、`pnpm typecheck` 全綠
