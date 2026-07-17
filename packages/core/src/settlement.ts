import { z } from "zod";

export const ArenaQuestSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "settled"]),
  deadline: z.date(),
});

export const ArenaSubmissionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "approved", "flagged"]),
  createdAt: z.date(),
});

export const ArenaVoteSchema = z.object({
  submissionId: z.string().min(1),
  voterId: z.string().min(1),
  createdAt: z.date(),
});

export const ArenaSettlementInputSchema = z.object({
  quest: ArenaQuestSchema,
  submissions: z.array(ArenaSubmissionSchema),
  votes: z.array(ArenaVoteSchema),
  now: z.date(),
});

export type ArenaQuest = z.infer<typeof ArenaQuestSchema>;
export type ArenaSubmission = z.infer<typeof ArenaSubmissionSchema>;
export type ArenaVote = z.infer<typeof ArenaVoteSchema>;
export type ArenaSettlementInput = z.infer<typeof ArenaSettlementInputSchema>;

export interface RankedSubmission {
  submissionId: string;
  votes: number;
  /** standard competition ranking:同票同名次(1, 2, 2, 4) */
  rank: number;
}

export type SettlementResult =
  | { settled: false; reason: "not-due" | "already-settled" }
  | { settled: true; ranking: RankedSubmission[]; winners: string[] };

/**
 * 擂台結算:截止 → 計票 → 排名。規則見 specs/03-arena-settlement.md。
 * 純函數;輸入驗證由呼叫端用 ArenaSettlementInputSchema 處理。
 */
export function settleArenaQuest(input: ArenaSettlementInput): SettlementResult {
  const { quest, submissions, votes, now } = input;

  if (quest.status === "settled") return { settled: false, reason: "already-settled" };
  if (now.getTime() < quest.deadline.getTime()) return { settled: false, reason: "not-due" };

  const approved = submissions.filter((s) => s.status === "approved");
  const approvedIds = new Set(approved.map((s) => s.id));

  // 一人一票:只算每個 voter 最早的有效票;投給非 approved 作品的票無效
  const earliestByVoter = new Map<string, ArenaVote>();
  const chronological = [...votes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const vote of chronological) {
    if (!approvedIds.has(vote.submissionId)) continue;
    if (!earliestByVoter.has(vote.voterId)) earliestByVoter.set(vote.voterId, vote);
  }

  const counts = new Map<string, number>();
  for (const vote of earliestByVoter.values()) {
    counts.set(vote.submissionId, (counts.get(vote.submissionId) ?? 0) + 1);
  }

  // 票數降冪;同票的顯示順序=先提交者在前(sort 穩定,名次仍相同)
  const sorted = approved
    .map((s) => ({ submissionId: s.id, votes: counts.get(s.id) ?? 0, createdAt: s.createdAt }))
    .sort((a, b) => b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime());

  const ranking: RankedSubmission[] = [];
  for (const [i, entry] of sorted.entries()) {
    const prev = ranking[i - 1];
    const rank = prev && prev.votes === entry.votes ? prev.rank : i + 1;
    ranking.push({ submissionId: entry.submissionId, votes: entry.votes, rank });
  }

  const winners = ranking.filter((r) => r.rank === 1 && r.votes > 0).map((r) => r.submissionId);
  return { settled: true, ranking, winners };
}
