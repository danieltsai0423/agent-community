import { describe, expect, it } from "vitest";
import {
  SubmitRequestSchema,
  VoteRequestSchema,
  checkSubmissionAllowed,
  checkVoteAllowed,
  type ParticipationQuest,
} from "../src/index.js";

const DEADLINE = new Date("2026-07-08T00:00:00Z");
const BEFORE = new Date("2026-07-07T00:00:00Z");

function quest(overrides: Partial<ParticipationQuest> = {}): ParticipationQuest {
  return { status: "active", deadline: DEADLINE, creatorId: "creator", ...overrides };
}

describe("checkSubmissionAllowed", () => {
  it("進行中且未截止 → 可提交", () => {
    expect(checkSubmissionAllowed({ quest: quest(), now: BEFORE })).toEqual({ allowed: true });
  });

  it("已結算 → quest-not-active", () => {
    expect(checkSubmissionAllowed({ quest: quest({ status: "settled" }), now: BEFORE })).toEqual({
      allowed: false,
      reason: "quest-not-active",
    });
  });

  it("到截止當下即不可提交(now === deadline)", () => {
    expect(checkSubmissionAllowed({ quest: quest(), now: DEADLINE })).toEqual({
      allowed: false,
      reason: "past-deadline",
    });
  });
});

describe("checkVoteAllowed", () => {
  const approved = { status: "approved" as const };

  it("進行中、未截止、approved 作品、非發起人 → 可投", () => {
    expect(
      checkVoteAllowed({ quest: quest(), submission: approved, voterId: "v1", now: BEFORE }),
    ).toEqual({ allowed: true });
  });

  it("已結算 → quest-not-active", () => {
    expect(
      checkVoteAllowed({
        quest: quest({ status: "settled" }),
        submission: approved,
        voterId: "v1",
        now: BEFORE,
      }),
    ).toEqual({ allowed: false, reason: "quest-not-active" });
  });

  it("已過截止 → past-deadline", () => {
    expect(
      checkVoteAllowed({ quest: quest(), submission: approved, voterId: "v1", now: DEADLINE }),
    ).toEqual({ allowed: false, reason: "past-deadline" });
  });

  it("發起人不能投自己的擂台", () => {
    expect(
      checkVoteAllowed({ quest: quest(), submission: approved, voterId: "creator", now: BEFORE }),
    ).toEqual({ allowed: false, reason: "creator-cannot-vote" });
  });

  it("作品不存在 → submission-not-votable", () => {
    expect(
      checkVoteAllowed({ quest: quest(), submission: undefined, voterId: "v1", now: BEFORE }),
    ).toEqual({ allowed: false, reason: "submission-not-votable" });
  });

  it("作品非 approved → submission-not-votable", () => {
    expect(
      checkVoteAllowed({
        quest: quest(),
        submission: { status: "pending" },
        voterId: "v1",
        now: BEFORE,
      }),
    ).toEqual({ allowed: false, reason: "submission-not-votable" });
  });
});

describe("request schemas", () => {
  it("SubmitRequestSchema:trim 後 1–2000 字、displayName 可省略", () => {
    expect(
      SubmitRequestSchema.safeParse({ content: "  詩一首  ", turnstileToken: "t" }).success,
    ).toBe(true);
    expect(SubmitRequestSchema.safeParse({ content: "   ", turnstileToken: "t" }).success).toBe(
      false,
    );
    expect(
      SubmitRequestSchema.safeParse({ content: "x".repeat(2001), turnstileToken: "t" }).success,
    ).toBe(false);
  });

  it("VoteRequestSchema:缺 turnstileToken 不合法", () => {
    expect(VoteRequestSchema.safeParse({ submissionId: "s1", turnstileToken: "t" }).success).toBe(
      true,
    );
    expect(VoteRequestSchema.safeParse({ submissionId: "s1" }).success).toBe(false);
  });
});
