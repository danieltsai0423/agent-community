import { SELF, env, runDurableObjectAlarm } from "cloudflare:test";
import { quests, votes } from "@tavern/db";
import { seedDemo } from "@tavern/db/seed";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 0.18 起無 isolatedStorage:整檔共用同一個 D1/DO,只 seed 一次、測試依序執行
const db = drizzle(env.DB);
const NOW = new Date();
const seeded = await seedDemo(db, NOW);

// 額外情境用的 quest:已結算、已過截止
const settledQuestId = crypto.randomUUID();
const expiredQuestId = crypto.randomUUID();
await db.insert(quests).values([
  {
    id: settledQuestId,
    creatorId: seeded.creatorId,
    title: "已結算的擂台",
    description: "-",
    status: "settled",
    deadline: new Date(NOW.getTime() + 86_400_000),
    createdAt: NOW,
  },
  {
    id: expiredQuestId,
    creatorId: seeded.creatorId,
    title: "已過期的擂台",
    description: "-",
    status: "active",
    deadline: new Date(NOW.getTime() - 1000),
    createdAt: NOW,
  },
]);

// 0.18 已無 cloudflare:test 的 fetchMock;SELF 主 worker 與測試同 isolate,
// 直接 stub globalThis.fetch 攔 Turnstile siteverify(SELF.fetch 走 Fetcher binding,不受影響)
const realFetch = globalThis.fetch;
let turnstileSuccess = true;

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/")) {
      return Response.json({ success: turnstileSuccess });
    }
    throw new Error(`測試不允許對外連線:${url}`);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function mockTurnstile(success: boolean) {
  turnstileSuccess = success;
}

function post(path: string, body: unknown, opts: { ip: string; cookie?: string }) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-connecting-ip": opts.ip,
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  return SELF.fetch(`https://api.local${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function uidCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /tavern_uid=([^;]+)/.exec(setCookie);
  if (!match) throw new Error(`no tavern_uid cookie in: ${setCookie}`);
  return `tavern_uid=${match[1]}`;
}

describe("GET /quests/:id", () => {
  it("回傳 quest 與 approved 作品(含票數)", async () => {
    const res = await SELF.fetch(`https://api.local/quests/${seeded.questId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      quest: { title: string; status: string };
      submissions: Array<{ votes: number; authorName: string }>;
    };
    expect(data.quest.title).toBe("讓你的 AI 用台語寫一首關於週一的詩");
    expect(data.quest.status).toBe("active");
    expect(data.submissions).toHaveLength(2);
    expect(data.submissions.every((s) => s.votes === 0)).toBe(true);
  });

  it("不存在 → 404 quest-not-found", async () => {
    const res = await SELF.fetch("https://api.local/quests/nope");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("quest-not-found");
  });
});

describe("POST /quests/:id/submissions", () => {
  it("body 不合法 → 400 invalid-request", async () => {
    const res = await post(
      `/quests/${seeded.questId}/submissions`,
      { content: "   " },
      { ip: "10.0.0.1" },
    );
    expect(res.status).toBe(400);
  });

  it("Turnstile 未通過 → 403", async () => {
    mockTurnstile(false);
    const res = await post(
      `/quests/${seeded.questId}/submissions`,
      { content: "一首詩", turnstileToken: "bad" },
      { ip: "10.0.0.2" },
    );
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("turnstile-failed");
  });

  it("成功提交 → 201、發 tavern_uid cookie、GET 看得到新作品", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${seeded.questId}/submissions`,
      { content: "拜一心情若落雨", displayName: "測試詩人", turnstileToken: "ok" },
      { ip: "10.0.0.3" },
    );
    expect(res.status).toBe(201);
    expect(uidCookie(res)).toMatch(/^tavern_uid=/);

    const view = await SELF.fetch(`https://api.local/quests/${seeded.questId}`);
    const data = (await view.json()) as {
      submissions: Array<{ content: string; authorName: string }>;
    };
    expect(data.submissions).toHaveLength(3);
    expect(data.submissions.some((s) => s.authorName === "測試詩人")).toBe(true);
  });

  it("已過截止 → 409 past-deadline", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${expiredQuestId}/submissions`,
      { content: "太晚了", turnstileToken: "ok" },
      { ip: "10.0.0.4" },
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("past-deadline");
  });
});

describe("POST /quests/:id/votes", () => {
  const target = () => seeded.submissionIds[0] as string;
  let voterCookie = "";

  it("成功投票 → 201;alarm flush 後 D1 有票、GET 票數 +1", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${seeded.questId}/votes`,
      { submissionId: target(), turnstileToken: "ok" },
      { ip: "10.0.1.1" },
    );
    expect(res.status).toBe(201);
    voterCookie = uidCookie(res);

    // 投票經 QuestVotes DO 緩衝,alarm 批次 flush 進 D1
    const stub = env.QUEST_VOTES.get(env.QUEST_VOTES.idFromName(seeded.questId));
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const rows = await db.select().from(votes).where(eq(votes.questId, seeded.questId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.submissionId).toBe(target());

    const view = await SELF.fetch(`https://api.local/quests/${seeded.questId}`);
    const data = (await view.json()) as { submissions: Array<{ id: string; votes: number }> };
    expect(data.submissions[0]?.id).toBe(target()); // 票數降冪,得票作品排最前
    expect(data.submissions[0]?.votes).toBe(1);
  });

  it("同一人再投 → 409 already-voted(DO 去重)", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${seeded.questId}/votes`,
      { submissionId: seeded.submissionIds[1], turnstileToken: "ok" },
      { ip: "10.0.1.2", cookie: voterCookie },
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("already-voted");
  });

  it("投給不存在的作品 → 409 submission-not-votable", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${seeded.questId}/votes`,
      { submissionId: "ghost", turnstileToken: "ok" },
      { ip: "10.0.1.3" },
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("submission-not-votable");
  });

  it("發起人投自己的擂台 → 409 creator-cannot-vote", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${seeded.questId}/votes`,
      { submissionId: target(), turnstileToken: "ok" },
      { ip: "10.0.1.4", cookie: `tavern_uid=${seeded.creatorId}` },
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("creator-cannot-vote");
  });

  it("已結算的擂台 → 409 quest-not-active", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${settledQuestId}/votes`,
      { submissionId: "any", turnstileToken: "ok" },
      { ip: "10.0.1.5" },
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("quest-not-active");
  });
});

describe("rate limit(DO 固定視窗)", () => {
  it("同 IP 一分鐘第 21 次寫入 → 429 rate-limited", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 20; i++) {
      const res = await post(`/quests/${seeded.questId}/votes`, {}, { ip });
      expect(res.status).toBe(400); // 限流通過,倒在 body 驗證
    }
    const res = await post(`/quests/${seeded.questId}/votes`, {}, { ip });
    expect(res.status).toBe(429);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe("rate-limited");
  });
});
