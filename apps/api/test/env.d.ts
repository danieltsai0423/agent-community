import type { QuestVotes } from "../src/do/quest-votes.js";
import type { RateLimiter } from "../src/do/rate-limiter.js";

declare global {
  namespace Cloudflare {
    interface Env {
      /** 測試 runtime 沒有 AI binding(值為 undefined)→ 走 fail-closed;假 AI 用 worker.fetch 注入 */
      AI: Ai;
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
      RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
      QUEST_VOTES: DurableObjectNamespace<QuestVotes>;
      TURNSTILE_SECRET_KEY: string;
    }
  }
}

export {};
