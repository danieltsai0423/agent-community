import { describe, expect, it } from "vitest";
import { tallyVotes, VoteSchema } from "../src/index.js";

describe("tallyVotes", () => {
  it("counts one vote per voter per submission", () => {
    const counts = tallyVotes([
      { submissionId: "s1", voterId: "a" },
      { submissionId: "s1", voterId: "a" },
      { submissionId: "s1", voterId: "b" },
      { submissionId: "s2", voterId: "a" },
    ]);
    expect(counts.get("s1")).toBe(2);
    expect(counts.get("s2")).toBe(1);
  });

  it("returns an empty map for no votes", () => {
    expect(tallyVotes([]).size).toBe(0);
  });
});

describe("VoteSchema", () => {
  it("rejects empty ids", () => {
    expect(VoteSchema.safeParse({ submissionId: "", voterId: "a" }).success).toBe(false);
  });
});
