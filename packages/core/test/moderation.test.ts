import { describe, expect, it } from "vitest";
import { decideSubmissionStatus } from "../src/index.js";

describe("decideSubmissionStatus", () => {
  it("safe → approved(公開)", () => {
    expect(decideSubmissionStatus("safe")).toBe("approved");
  });

  it("unsafe → flagged(不公開)", () => {
    expect(decideSubmissionStatus("unsafe")).toBe("flagged");
  });

  it("unavailable → pending(fail-closed,不公開)", () => {
    expect(decideSubmissionStatus("unavailable")).toBe("pending");
  });
});
