import {
  SubmitRequestSchema,
  VoteRequestSchema,
  checkSubmissionAllowed,
  checkVoteAllowed,
} from "@tavern/core";
import { quests, submissions, users, votes } from "@tavern/db";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { QuestVotes } from "./do/quest-votes.js";
import { RateLimiter } from "./do/rate-limiter.js";
import type { Env } from "./env.js";
import { apiError } from "./errors.js";
import { ensureUser } from "./identity.js";
import { verifyTurnstile } from "./turnstile.js";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/*",
  cors({
    origin: ["https://tavern-web.daniel0423.workers.dev", "http://localhost:8787"],
    credentials: true,
  }),
);

// 寫入端點先過限流(依 IP,DO 固定視窗)
app.use("/quests/:id/*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const limiter = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(ip));
  if (!(await limiter.checkLimit())) return apiError(c, "rate-limited");
  return next();
});

app.get("/health", (c) => c.json({ ok: true, service: "api" }));

app.get("/quests/:id", async (c) => {
  const questId = c.req.param("id");
  const db = drizzle(c.env.DB);

  const quest = await db.select().from(quests).where(eq(quests.id, questId)).get();
  if (!quest) return apiError(c, "quest-not-found");

  const rows = await db
    .select({
      id: submissions.id,
      content: submissions.content,
      authorName: users.displayName,
      createdAt: submissions.createdAt,
      votes: count(votes.id),
    })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.authorId))
    .leftJoin(votes, eq(votes.submissionId, submissions.id))
    .where(and(eq(submissions.questId, questId), eq(submissions.status, "approved")))
    .groupBy(submissions.id);

  // 票數降冪、同票先提交者在前(與結算排序一致)
  rows.sort((a, b) => b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime());

  return c.json({
    quest: {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      status: quest.status,
      deadline: quest.deadline.toISOString(),
      createdAt: quest.createdAt.toISOString(),
    },
    submissions: rows.map((r) => ({
      id: r.id,
      content: r.content,
      authorName: r.authorName,
      votes: r.votes,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

app.post("/quests/:id/submissions", async (c) => {
  const questId = c.req.param("id");
  const parsed = SubmitRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return apiError(c, "invalid-request");

  const ip = c.req.header("cf-connecting-ip");
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, parsed.data.turnstileToken, ip))) {
    return apiError(c, "turnstile-failed");
  }

  const db = drizzle(c.env.DB);
  const quest = await db.select().from(quests).where(eq(quests.id, questId)).get();
  if (!quest) return apiError(c, "quest-not-found");

  const check = checkSubmissionAllowed({ quest, now: new Date() });
  if (!check.allowed) return apiError(c, check.reason);

  const authorId = await ensureUser(c, db, parsed.data.displayName);
  const id = crypto.randomUUID();
  await db.insert(submissions).values({
    id,
    questId,
    authorId,
    content: parsed.data.content,
    // P0 任務 4 直接公開;任務 7 改為 pending + Workers AI 審核後翻轉
    status: "approved",
    createdAt: new Date(),
  });
  return c.json({ id }, 201);
});

app.post("/quests/:id/votes", async (c) => {
  const questId = c.req.param("id");
  const parsed = VoteRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return apiError(c, "invalid-request");

  const ip = c.req.header("cf-connecting-ip");
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, parsed.data.turnstileToken, ip))) {
    return apiError(c, "turnstile-failed");
  }

  const db = drizzle(c.env.DB);
  const quest = await db.select().from(quests).where(eq(quests.id, questId)).get();
  if (!quest) return apiError(c, "quest-not-found");

  const submission = await db
    .select({ status: submissions.status })
    .from(submissions)
    .where(and(eq(submissions.id, parsed.data.submissionId), eq(submissions.questId, questId)))
    .get();

  const voterId = await ensureUser(c, db);
  const check = checkVoteAllowed({ quest, submission, voterId, now: new Date() });
  if (!check.allowed) return apiError(c, check.reason);

  const questVotes = c.env.QUEST_VOTES.get(c.env.QUEST_VOTES.idFromName(questId));
  const result = await questVotes.castVote({
    questId,
    submissionId: parsed.data.submissionId,
    voterId,
    votedAt: Date.now(),
  });
  if (result === "already-voted") return apiError(c, "already-voted");
  return c.json({ ok: true }, 201);
});

export default app;
export { QuestVotes, RateLimiter };
