import { votes } from "@tavern/db";
import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env.js";

const FLUSH_DELAY_MS = 5_000;

interface BufferedVote {
  id: string;
  questId: string;
  submissionId: string;
  voterId: string;
  createdAt: number;
}

/**
 * 每 Quest 一實例(id = questId)的投票聚合:
 * 去重(一人一票)→ 緩衝 → alarm 批次 flush 進 D1。
 * 免費層紅線:投票不直寫 D1,經 DO 聚合批次寫入。
 */
export class QuestVotes extends DurableObject<Env> {
  async castVote(vote: {
    questId: string;
    submissionId: string;
    voterId: string;
    votedAt: number;
  }): Promise<"accepted" | "already-voted"> {
    const voterKey = `voter:${vote.voterId}`;
    if (await this.ctx.storage.get(voterKey)) return "already-voted";
    await this.ctx.storage.put(voterKey, true);

    const buffer = (await this.ctx.storage.get<BufferedVote[]>("buffer")) ?? [];
    buffer.push({
      id: crypto.randomUUID(),
      questId: vote.questId,
      submissionId: vote.submissionId,
      voterId: vote.voterId,
      createdAt: vote.votedAt,
    });
    await this.ctx.storage.put("buffer", buffer);

    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + FLUSH_DELAY_MS);
    }
    return "accepted";
  }

  async alarm(): Promise<void> {
    const buffer = (await this.ctx.storage.get<BufferedVote[]>("buffer")) ?? [];
    if (buffer.length === 0) return;

    const db = drizzle(this.env.DB);
    await db
      .insert(votes)
      .values(buffer.map((v) => ({ ...v, createdAt: new Date(v.createdAt) })))
      // D1 的 unique index(quest, voter)是最後防線;撞到就丟棄該票
      .onConflictDoNothing();
    await this.ctx.storage.delete("buffer");
  }
}
