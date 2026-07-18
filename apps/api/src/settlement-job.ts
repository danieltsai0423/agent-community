import { settleArenaQuest } from "@tavern/core";
import { quests, submissions, votes } from "@tavern/db";
import { and, eq, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./env.js";

// 單次 cron 最多處理的擂台數(免費層紅線:單 invocation subrequest ≤ 50)
const MAX_QUESTS_PER_RUN = 10;

/**
 * 截止自動結算:撈到期的 active 擂台 → flush DO 緩衝票 → settleArenaQuest(core)
 * → 批次寫入 settled 狀態與 final_rank / final_votes。規則全部在 core,這裡只是薄殼。
 */
export async function settleDueQuests(env: Env, now: Date): Promise<{ settled: string[] }> {
  const db = drizzle(env.DB);
  const due = await db
    .select()
    .from(quests)
    .where(and(eq(quests.status, "active"), lte(quests.deadline, now)))
    .limit(MAX_QUESTS_PER_RUN);

  const settledIds: string[] = [];
  for (const quest of due) {
    // 把 QuestVotes DO 還在緩衝的票先寫進 D1,再計票
    await env.QUEST_VOTES.get(env.QUEST_VOTES.idFromName(quest.id)).flush();

    const subRows = await db.select().from(submissions).where(eq(submissions.questId, quest.id));
    const voteRows = await db.select().from(votes).where(eq(votes.questId, quest.id));

    const result = settleArenaQuest({
      quest: { id: quest.id, status: quest.status, deadline: quest.deadline },
      submissions: subRows.map((s) => ({ id: s.id, status: s.status, createdAt: s.createdAt })),
      votes: voteRows.map((v) => ({
        submissionId: v.submissionId,
        voterId: v.voterId,
        createdAt: v.createdAt,
      })),
      now,
    });
    if (!result.settled) continue;

    const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
      db
        .update(quests)
        .set({ status: "settled", settledAt: now })
        .where(and(eq(quests.id, quest.id), eq(quests.status, "active"))),
      ...result.ranking.map((r) =>
        db
          .update(submissions)
          .set({ finalRank: r.rank, finalVotes: r.votes })
          .where(eq(submissions.id, r.submissionId)),
      ),
    ];
    await db.batch(statements);
    settledIds.push(quest.id);
  }
  return { settled: settledIds };
}
