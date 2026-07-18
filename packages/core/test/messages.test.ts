import { describe, expect, it } from "vitest";
import { API_ERROR_MESSAGES } from "../src/index.js";

describe("API_ERROR_MESSAGES", () => {
  it("每個錯誤碼都有非空的繁中文案,且不含對外禁用術語", () => {
    for (const message of Object.values(API_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/MCP|connector|agent/i);
    }
  });
});
