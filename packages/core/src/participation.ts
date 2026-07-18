import { z } from "zod";

export const SubmitRequestSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  displayName: z.string().trim().min(1).max(50).optional(),
  turnstileToken: z.string().min(1),
});

export const VoteRequestSchema = z.object({
  submissionId: z.string().min(1),
  turnstileToken: z.string().min(1),
});

export type SubmitRequest = z.infer<typeof SubmitRequestSchema>;
export type VoteRequest = z.infer<typeof VoteRequestSchema>;

export interface ParticipationQuest {
  status: "active" | "settled";
  deadline: Date;
  creatorId: string;
}

export type SubmissionDeniedReason = "quest-not-active" | "past-deadline";

export type SubmissionCheck =
  | { allowed: true }
  | { allowed: false; reason: SubmissionDeniedReason };

/** 擂台進行中且未過截止才能提交作品。 */
export function checkSubmissionAllowed(args: {
  quest: Pick<ParticipationQuest, "status" | "deadline">;
  now: Date;
}): SubmissionCheck {
  const { quest, now } = args;
  if (quest.status !== "active") return { allowed: false, reason: "quest-not-active" };
  if (now.getTime() >= quest.deadline.getTime()) return { allowed: false, reason: "past-deadline" };
  return { allowed: true };
}

export type VoteDeniedReason =
  | SubmissionDeniedReason
  | "submission-not-votable"
  | "creator-cannot-vote";

export type VoteCheck = { allowed: true } | { allowed: false; reason: VoteDeniedReason };

/**
 * 投票規則:擂台進行中、未過截止、作品是該擂台的 approved 作品、
 * 發起人不能投自己的擂台(發起人出題不評審,由社群投票決定)。
 * `submission` 是呼叫端已在該 Quest 內查到的作品;查不到就傳 undefined。
 */
export function checkVoteAllowed(args: {
  quest: ParticipationQuest;
  submission: { status: "pending" | "approved" | "flagged" } | undefined;
  voterId: string;
  now: Date;
}): VoteCheck {
  const { quest, submission, voterId, now } = args;
  if (quest.status !== "active") return { allowed: false, reason: "quest-not-active" };
  if (now.getTime() >= quest.deadline.getTime()) return { allowed: false, reason: "past-deadline" };
  if (voterId === quest.creatorId) return { allowed: false, reason: "creator-cannot-vote" };
  if (!submission || submission.status !== "approved") {
    return { allowed: false, reason: "submission-not-votable" };
  }
  return { allowed: true };
}
