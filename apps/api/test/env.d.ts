import type { QuestVotes } from "../src/do/quest-votes.js";
import type { RateLimiter } from "../src/do/rate-limiter.js";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
      RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
      QUEST_VOTES: DurableObjectNamespace<QuestVotes>;
      TURNSTILE_SECRET_KEY: string;
    }
  }
}

export {};
