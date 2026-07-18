# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

The product spec lives in `agent-collab-community-產品規劃.md` (in Traditional Chinese): the full product plan for **任務酒館 / Quest Tavern**, a human + AI agent collaboration community accessed through Claude/ChatGPT via remote MCP, plus a lightweight web frontend. Read that document before doing any design or implementation work; its Appendix B is the implementation blueprint this file summarizes. The monorepo scaffold (P0 task 1) is in place; feature specs live in `specs/` (one per task, with acceptance criteria).

## Commands

- `pnpm test` — run all workspace tests (core runs plain Vitest; apps run inside workerd via `@cloudflare/vitest-pool-workers`)
- `pnpm --filter @tavern/core test` — test a single workspace; add `-- -t "name"` for a single test
- `pnpm typecheck` — `tsc --noEmit` in every workspace
- `pnpm --filter @tavern/api dev` / `--filter @tavern/web dev` — local dev via `wrangler dev`
- `pnpm run deploy:all` — `wrangler deploy` every app (CI does this on push to main; needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`)

Note: vitest-pool-workers v0.18+ uses the Vite-plugin API — `cloudflareTest()` from the package root in `vitest.config.ts`, not the removed `defineWorkersConfig` from `/config`. Ambient types for `cloudflare:test` come from the `@cloudflare/vitest-pool-workers/types` entry in tsconfig `types`.

## Product in one paragraph

The core unit is the **Quest** (擂台/competition type first; collaborative type later): anyone posts a challenge, others submit contributions (their own or their agent's), the community votes, and results settle at a deadline. Agents have identity cards with win records; humans are "trainers" with XP. MVP roadmap: P0 is a web-only single-Quest arena page (view prompt → copy → paste answer → vote); MCP connector, OAuth, and agent cards come in P1.

## Decided tech stack (do not re-litigate)

- **TypeScript strict mode** everywhere; **Hono** for the API on Cloudflare Workers
- **Cloudflare free tier only**: D1 (main DB via **Drizzle**), Durable Objects (vote aggregation, rate limiting), R2 (images/artifacts), Workers AI (moderation, embeddings), Queues, Cron Triggers (quest settlement), Turnstile (bot protection)
- **Cloudflare Agents SDK + workers-oauth-provider** for the MCP endpoint — do not hand-roll an MCP gateway
- **Zod** for all validation, shared across API / MCP tools / frontend
- **Vitest + @cloudflare/vitest-pool-workers** for tests (runs inside the Workers runtime)
- **Wrangler + GitHub Actions** for deploy (push to main auto-deploys; PRs get preview environments)
- Frontend: Hono JSX/SSR + htmx preferred (P0 is only ~3 pages; no React)

## Monorepo structure

```
(repo root = pnpm workspace "tavern")
├── packages/core   # Zod schemas + pure-function business logic (settlement/reputation/remix lineage)
├── packages/db     # Drizzle schema + migrations + seed
├── apps/api        # Hono REST routes (used by web) — Worker "tavern-api"
├── apps/mcp        # MCP endpoint (createMcpHandler, thin gateway → calls apps/api via service binding) — Worker "tavern-mcp"
├── apps/web        # SSR pages (mobile-first, Hono JSX) — Worker "tavern-web"
└── specs/          # one spec.md per feature (acceptance criteria) — task tickets for coding agents
```

## Hard rules (from the plan's coding-agent charter)

1. **Business logic lives only in `packages/core`** as pure functions with no Cloudflare dependencies. `apps/*` are thin shells — one logic implementation, two entry points (REST + MCP), so changes can't diverge.
2. **All inputs/outputs go through Zod.** Any new endpoint gets a `specs/*.md` with acceptance criteria before code.
3. **Cloudflare free-tier red lines:** ≤50 subrequests per Worker invocation; KV is read-only on hot paths (only ~1k writes/day free); vote writes must go through Durable Object aggregation with batched flushes to D1 (D1 free tier: 100k row writes/day).
4. **All user-facing copy is Traditional Chinese** and must avoid jargon like "MCP", "connector", "agent" — say 「派你的 AI 參賽」 instead. MCP tool names and technical docs stay in English.

## P0 scope guard

P0 explicitly excludes: MCP endpoint, OAuth login (use email magic link or anonymous + Turnstile), agent cards, feed algorithm. Quest type is arena/擂台 only (vote-based settlement); collaborative Quests are P1. Every P0 task in Appendix B has an acceptance criterion — implement against those.

## Key mechanics to preserve when implementing

- Quests have deadlines; Cron Triggers auto-settle (count votes → rank → publish results).
- Arena Quests: the creator sets the topic/deadline but cannot judge — the community votes.
- Submissions pass a Workers AI moderation pipeline before going public (flagged content goes to a pending queue).
- Reputation is dual-track and non-transferable: trainer XP (humans) and agent win records (agent cards). No tokens, no purchasable points.
