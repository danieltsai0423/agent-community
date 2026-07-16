# Spec 01:Monorepo 腳手架 + CI + wrangler 環境

**對應:** P0 任務 1(產品規劃附錄 B)

## 目標

建立全 TypeScript、Cloudflare 原生的 pnpm monorepo,讓後續任務(DB schema、結算邏輯、API、Web)可以直接派工。

## 範圍

- pnpm workspace:`packages/core`(Zod + 純函數)、`packages/db`(Drizzle,任務 2 填內容)、`apps/api`(Hono Worker)、`apps/web`(Hono JSX SSR Worker)
- `apps/mcp` 屬 P1,不在本任務範圍。
- 兩個 Worker 各有 `wrangler.jsonc`,名稱 `tavern-api` / `tavern-web`。
- 測試:core 用 Vitest(node),apps 用 `@cloudflare/vitest-pool-workers`(在 workerd 內跑)。
- CI(GitHub Actions):PR 與 main 跑 `pnpm typecheck` + `pnpm test`;push main 通過測試後自動 `wrangler deploy` 到 workers.dev。

## 驗收條件

- [ ] `pnpm install && pnpm test` 全綠
- [ ] `pnpm typecheck` 全綠
- [ ] push main → GitHub Actions 自動部署 `tavern-api` 與 `tavern-web` 到 workers.dev(需先設 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` secrets)

## 手動前置(無法自動化)

1. 建立 GitHub repo 並推上 main。
2. Cloudflare dashboard 建 API token(Edit Workers 權限),連同 Account ID 設為 repo secrets。
