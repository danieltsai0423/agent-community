import type { ModerationOutcome } from "@tavern/core";

const MODEL = "@cf/meta/llama-guard-3-8b";

/** 只取用到的最小介面,避免綁死 workers-types 的模型清單版本 */
interface ModerationAi {
  run(model: string, inputs: { messages: Array<{ role: string; content: string }> }): Promise<unknown>;
}

/**
 * Workers AI(Llama Guard)判讀內容。任何失敗(binding 不存在、呼叫錯誤、
 * 輸出讀不懂)一律回 unavailable —— fail-closed,由 core 決策成 pending。
 */
export async function moderateContent(ai: unknown, content: string): Promise<ModerationOutcome> {
  try {
    const result = await (ai as ModerationAi).run(MODEL, {
      messages: [{ role: "user", content }],
    });
    const text = (result as { response?: unknown }).response;
    if (typeof text !== "string") return "unavailable";
    const verdict = text.trim().toLowerCase().split(/\s+/)[0];
    if (verdict === "safe") return "safe";
    if (verdict === "unsafe") return "unsafe";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
