import type { QuestVotes } from "./do/quest-votes.js";
import type { RateLimiter } from "./do/rate-limiter.js";

export interface Env {
  AI: Ai;
  DB: D1Database;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  QUEST_VOTES: DurableObjectNamespace<QuestVotes>;
  TURNSTILE_SECRET_KEY: string;
}
