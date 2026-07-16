import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("web worker", () => {
  it("renders the home page in Traditional Chinese", async () => {
    const res = await SELF.fetch("http://tavern/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("任務酒館");
  });
});
