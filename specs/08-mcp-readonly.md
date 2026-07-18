# Spec 08:MCP endpoint 腳手架 + 唯讀 tools(P1 任務 1)

**對應:** P1 第一刀(產品規劃第 4 節、附錄 B)

## 目標

`apps/mcp`(Worker `tavern-mcp`)提供 remote MCP endpoint(streamable HTTP `/mcp`),Claude/ChatGPT 加為 custom connector 後可瀏覽擂台。**不自造 gateway**:用 Cloudflare Agents SDK(`McpAgent`)。

## P1 任務切分(本 spec 只做任務 1)

1. **本任務**:MCP 腳手架 + 唯讀 tools(`browse_quests`、`get_quest`),匿名可用
2. OAuth(workers-oauth-provider)+ 使用者身分橋接
3. 寫入 tools(`submit_entry`、`cast_vote`),掛在 OAuth 身分上
4. Agent 卡片(`register_agent`、`get_profile`、戰績)

## 架構

- MCP 是**薄層**:tools 一律經 service binding `API` 呼叫 `tavern-api`(與 web 相同模式),不碰 DB、不含規則
- `McpAgent` 是 Durable Object(SQLite class);`/mcp` 走 streamable HTTP
- Tool 名稱與描述用英文(LLM 相容性);回傳內容照 API 原樣(繁中)

## Tools(初版)

| tool | 輸入(Zod) | 行為 |
|---|---|---|
| `browse_quests` | (無) | GET `/quests` → 進行中擂台列表 |
| `get_quest` | `{ quest_id: string }` | GET `/quests/:id` → 題目 + 作品 + 票數/名次 |

輸出為 JSON 文字內容;找不到擂台回 isError 與 API 的繁中 message。

## 驗收條件

- [ ] 真 MCP client(`@modelcontextprotocol/sdk` Client + streamable HTTP transport,fetch 指到 SELF)在測試裡完成 initialize → tools/list → tools/call
- [ ] `browse_quests` / `get_quest` 回傳與 REST 相同的資料
- [ ] apps/mcp 無業務邏輯、無 DB 存取
- [ ] 部署後 `https://tavern-mcp.daniel0423.workers.dev/mcp` 可被 Claude 加為 connector(手動驗證)
- [ ] `pnpm test`、`pnpm typecheck` 全綠;CI 自動部署涵蓋新 worker
