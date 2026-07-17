import { describe, expect, it } from "vitest";
import {
  ArenaSettlementInputSchema,
  settleArenaQuest,
  type ArenaSettlementInput,
  type ArenaSubmission,
  type ArenaVote,
} from "../src/index.js";

const T0 = new Date("2026-07-01T00:00:00Z");
const DEADLINE = new Date("2026-07-08T00:00:00Z");
const AFTER = new Date("2026-07-08T00:00:01Z");

function minutesAfterT0(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

function submission(id: string, opts: Partial<ArenaSubmission> = {}): ArenaSubmission {
  return { id, status: "approved", createdAt: T0, ...opts };
}

function vote(submissionId: string, voterId: string, createdAt: Date = T0): ArenaVote {
  return { submissionId, voterId, createdAt };
}

function input(overrides: Partial<ArenaSettlementInput> = {}): ArenaSettlementInput {
  return {
    quest: { id: "q1", status: "active", deadline: DEADLINE },
    submissions: [],
    votes: [],
    now: AFTER,
    ...overrides,
  };
}

describe("settleArenaQuest 前置檢查", () => {
  it("已結算的 Quest 不重複結算(冪等)", () => {
    const result = settleArenaQuest(
      input({ quest: { id: "q1", status: "settled", deadline: DEADLINE } }),
    );
    expect(result).toEqual({ settled: false, reason: "already-settled" });
  });

  it("未到截止時間不結算", () => {
    const result = settleArenaQuest(input({ now: new Date(DEADLINE.getTime() - 1) }));
    expect(result).toEqual({ settled: false, reason: "not-due" });
  });

  it("剛好到截止時間就結算(now === deadline)", () => {
    const result = settleArenaQuest(input({ now: DEADLINE }));
    expect(result.settled).toBe(true);
  });
});

describe("settleArenaQuest 計票與排名", () => {
  it("依票數排名,冠軍是最高票", () => {
    const result = settleArenaQuest(
      input({
        submissions: [submission("s1"), submission("s2"), submission("s3")],
        votes: [
          vote("s1", "v1"),
          vote("s1", "v2"),
          vote("s2", "v3"),
          // s3 零票
        ],
      }),
    );
    expect(result).toEqual({
      settled: true,
      ranking: [
        { submissionId: "s1", votes: 2, rank: 1 },
        { submissionId: "s2", votes: 1, rank: 2 },
        { submissionId: "s3", votes: 0, rank: 3 },
      ],
      winners: ["s1"],
    });
  });

  it("平手同名次(1, 2, 2, 4),同名次先提交者在前", () => {
    const result = settleArenaQuest(
      input({
        submissions: [
          submission("late", { createdAt: minutesAfterT0(10) }),
          submission("early", { createdAt: minutesAfterT0(1) }),
          submission("top"),
          submission("zero"),
        ],
        votes: [
          vote("top", "v1"),
          vote("top", "v2"),
          vote("top", "v3"),
          vote("late", "v4"),
          vote("early", "v5"),
        ],
      }),
    );
    if (!result.settled) throw new Error("should settle");
    expect(result.ranking).toEqual([
      { submissionId: "top", votes: 3, rank: 1 },
      { submissionId: "early", votes: 1, rank: 2 },
      { submissionId: "late", votes: 1, rank: 2 },
      { submissionId: "zero", votes: 0, rank: 4 },
    ]);
    expect(result.winners).toEqual(["top"]);
  });

  it("多位冠軍:第一名平手全列 winners", () => {
    const result = settleArenaQuest(
      input({
        submissions: [submission("a"), submission("b", { createdAt: minutesAfterT0(1) })],
        votes: [vote("a", "v1"), vote("b", "v2")],
      }),
    );
    if (!result.settled) throw new Error("should settle");
    expect(result.winners).toEqual(["a", "b"]);
  });

  it("投給 pending/flagged/不存在作品的票無效", () => {
    const result = settleArenaQuest(
      input({
        submissions: [
          submission("ok"),
          submission("hidden", { status: "pending" }),
          submission("bad", { status: "flagged" }),
        ],
        votes: [
          vote("ok", "v1"),
          vote("hidden", "v2"),
          vote("bad", "v3"),
          vote("ghost", "v4"), // 不存在的作品
        ],
      }),
    );
    expect(result).toEqual({
      settled: true,
      ranking: [{ submissionId: "ok", votes: 1, rank: 1 }],
      winners: ["ok"],
    });
  });

  it("同一 voter 多張票只算最早那張", () => {
    const result = settleArenaQuest(
      input({
        submissions: [submission("first"), submission("second", { createdAt: minutesAfterT0(1) })],
        votes: [
          vote("second", "dupe", minutesAfterT0(5)), // 較晚,不算
          vote("first", "dupe", minutesAfterT0(2)), // 最早的有效票
          vote("second", "other", minutesAfterT0(3)),
        ],
      }),
    );
    if (!result.settled) throw new Error("should settle");
    expect(result.ranking).toEqual([
      { submissionId: "first", votes: 1, rank: 1 },
      { submissionId: "second", votes: 1, rank: 1 },
    ]);
  });

  it("全場零票:照提交順序排名、無冠軍", () => {
    const result = settleArenaQuest(
      input({
        submissions: [submission("a"), submission("b", { createdAt: minutesAfterT0(1) })],
      }),
    );
    expect(result).toEqual({
      settled: true,
      ranking: [
        { submissionId: "a", votes: 0, rank: 1 },
        { submissionId: "b", votes: 0, rank: 1 },
      ],
      winners: [],
    });
  });

  it("零件作品:空排名、無冠軍", () => {
    const result = settleArenaQuest(input({ votes: [vote("ghost", "v1")] }));
    expect(result).toEqual({ settled: true, ranking: [], winners: [] });
  });
});

describe("ArenaSettlementInputSchema", () => {
  it("接受合法輸入、拒絕缺欄位的輸入", () => {
    expect(ArenaSettlementInputSchema.safeParse(input()).success).toBe(true);
    expect(ArenaSettlementInputSchema.safeParse({}).success).toBe(false);
  });
});
