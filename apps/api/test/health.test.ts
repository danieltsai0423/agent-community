import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("api worker", () => {
  it("responds to the health check", async () => {
    const res = await SELF.fetch("http://tavern/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "api" });
  });
});
