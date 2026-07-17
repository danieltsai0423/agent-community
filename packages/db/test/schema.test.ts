import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { quests, submissions, users, votes } from "../src/schema.js";
import { seedDemo } from "../src/seed.js";

// setup.ts 已套用 migrations;整個測試檔共用一次 seed(D1 狀態在測試間不隔離)
const db = drizzle(env.DB);
const seeded = await seedDemo(db);

describe("migrations", () => {
  it("creates all four tables", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const table of ["users", "quests", "submissions", "votes"]) {
      expect(names).toContain(table);
    }
  });
});

describe("seedDemo", () => {
  it("creates an active demo quest with two approved submissions", async () => {
    const quest = await db.select().from(quests).where(eq(quests.id, seeded.questId)).get();
    expect(quest).toBeDefined();
    expect(quest?.status).toBe("active");
    expect(quest?.type).toBe("arena");
    expect(quest?.deadline.getTime()).toBeGreaterThan(Date.now());

    const subs = await db
      .select()
      .from(submissions)
      .where(eq(submissions.questId, seeded.questId))
      .all();
    expect(subs).toHaveLength(2);
    expect(subs.every((s) => s.status === "approved")).toBe(true);
  });
});

describe("votes constraints", () => {
  it("rejects a second vote from the same voter on the same quest", async () => {
    const { questId, creatorId, submissionIds } = seeded;
    const [first, second] = submissionIds;
    if (!first || !second) throw new Error("seed should create two submissions");

    const voter = {
      id: crypto.randomUUID(),
      email: null,
      displayName: "投票的常客",
      createdAt: new Date(),
    };
    await db.insert(users).values(voter);

    await db.insert(votes).values({
      id: crypto.randomUUID(),
      questId,
      submissionId: first,
      voterId: voter.id,
      createdAt: new Date(),
    });

    // 同一人在同一 Quest 改投另一件作品也要被擋(unique(quest_id, voter_id))
    // drizzle 會把 D1 的錯誤包成 Failed query,UNIQUE 訊息在 cause 鏈裡
    const error: unknown = await db
      .insert(votes)
      .values({
        id: crypto.randomUUID(),
        questId,
        submissionId: second,
        voterId: voter.id,
        createdAt: new Date(),
      })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const messages: string[] = [];
    for (let e = error; e instanceof Error; e = e.cause) messages.push(e.message);
    expect(messages.join(" | ")).toMatch(/UNIQUE/i);

    // 但另一個人投票沒問題,而且發起人也可以投(發起人不能「裁決」,投票是社群行為)
    await db.insert(votes).values({
      id: crypto.randomUUID(),
      questId,
      submissionId: second,
      voterId: creatorId,
      createdAt: new Date(),
    });
    const all = await db.select().from(votes).where(eq(votes.questId, questId)).all();
    expect(all).toHaveLength(2);
  });
});
