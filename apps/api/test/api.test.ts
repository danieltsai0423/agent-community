import {
  SELF,
  createExecutionContext,
  createScheduledController,
  env,
  runDurableObjectAlarm,
  waitOnExecutionContext,
} from "cloudflare:test";
import { quests, submissions, users, votes } from "@tavern/db";
import { seedDemo } from "@tavern/db/seed";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index.js";

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

  it("成功提交 → 201 回 status、發 cookie;無 AI binding → fail-closed 進 pending 不公開", async () => {
    mockTurnstile(true);
    const res = await post(
      `/quests/${seeded.questId}/submissions`,
      { content: "拜一心情若落雨", displayName: "測試詩人", turnstileToken: "ok" },
      { ip: "10.0.0.3" },
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; status: string };
    expect(data.status).toBe("pending"); // 測試環境沒有 AI binding → unavailable → pending
    expect(uidCookie(res)).toMatch(/^tavern_uid=/);

    const view = await SELF.fetch(`https://api.local/quests/${seeded.questId}`);
    const viewData = (await view.json()) as { submissions: unknown[] };
    expect(viewData.submissions).toHaveLength(2); // pending 不公開
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

describe("GET /quests", () => {
  it("列出 active 擂台(截止近的在前、含 approved 作品數),不含已結算", async () => {
    const res = await SELF.fetch("https://api.local/quests");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      quests: Array<{ id: string; submissionCount: number }>;
    };
    const ids = data.quests.map((q) => q.id);
    expect(ids).toContain(seeded.questId);
    expect(ids).toContain(expiredQuestId);
    expect(ids).not.toContain(settledQuestId);
    // deadline 升冪:已過期的排最前
    expect(ids.indexOf(expiredQuestId)).toBeLessThan(ids.indexOf(seeded.questId));
    // 前面的提交測試新增的作品進了 pending,不計入 approved 數
    expect(data.quests.find((q) => q.id === seeded.questId)?.submissionCount).toBe(2);
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

describe("cron 結算(scheduled handler)", () => {
  it("到期擂台自動結算:DO 緩衝票 flush → settleArenaQuest → 寫入名次", async () => {
    // 建一個進行中的擂台:A、B approved,C pending
    const questId = crypto.randomUUID();
    const authorIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const voterIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values(
      [...authorIds, ...voterIds].map((id) => ({
        id,
        email: null,
        displayName: "測試人",
        createdAt: NOW,
      })),
    );
    await db.insert(quests).values({
      id: questId,
      creatorId: seeded.creatorId,
      title: "結算測試擂台",
      description: "-",
      status: "active",
      deadline: new Date(Date.now() + 3_600_000),
      createdAt: NOW,
    });
    const [subA, subB, subC] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(submissions).values([
      { id: subA!, questId, authorId: authorIds[0]!, content: "A", status: "approved", createdAt: NOW },
      {
        id: subB!,
        questId,
        authorId: authorIds[1]!,
        content: "B",
        status: "approved",
        createdAt: new Date(NOW.getTime() + 60_000),
      },
      { id: subC!, questId, authorId: authorIds[2]!, content: "C", status: "pending", createdAt: NOW },
    ]);

    // subA 的 1 票走 API → 停在 QuestVotes DO 緩衝(不跑 alarm),驗證結算前的 flush
    mockTurnstile(true);
    const voteRes = await post(
      `/quests/${questId}/votes`,
      { submissionId: subA, turnstileToken: "ok" },
      { ip: "10.0.2.1" },
    );
    expect(voteRes.status).toBe(201);

    // subB 2 票、subC(pending)1 票直接進 D1;pending 的票結算時應被忽略
    await db.insert(votes).values([
      { id: crypto.randomUUID(), questId, submissionId: subB!, voterId: voterIds[0]!, createdAt: NOW },
      { id: crypto.randomUUID(), questId, submissionId: subB!, voterId: voterIds[1]!, createdAt: NOW },
      { id: crypto.randomUUID(), questId, submissionId: subC!, voterId: voterIds[2]!, createdAt: NOW },
    ]);

    // 讓擂台到期,執行 cron
    await db.update(quests).set({ deadline: new Date(Date.now() - 1000) }).where(eq(quests.id, questId));
    const controller = createScheduledController({ scheduledTime: new Date(), cron: "*/5 * * * *" });
    const ctx = createExecutionContext();
    worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    const quest = await db.select().from(quests).where(eq(quests.id, questId)).get();
    expect(quest?.status).toBe("settled");
    expect(quest?.settledAt).not.toBeNull();

    const subs = await db.select().from(submissions).where(eq(submissions.questId, questId));
    const byId = new Map(subs.map((s) => [s.id, s]));
    expect(byId.get(subB!)).toMatchObject({ finalRank: 1, finalVotes: 2 });
    // subA 的票原本只在 DO 緩衝裡 → flush 有生效才會是 1 票
    expect(byId.get(subA!)).toMatchObject({ finalRank: 2, finalVotes: 1 });
    expect(byId.get(subC!)).toMatchObject({ finalRank: null, finalVotes: null });

    // GET 依名次回傳
    const view = (await (await SELF.fetch(`https://api.local/quests/${questId}`)).json()) as {
      quest: { status: string };
      submissions: Array<{ id: string; votes: number; rank: number | null }>;
    };
    expect(view.quest.status).toBe("settled");
    expect(view.submissions.map((s) => s.id)).toEqual([subB, subA]);
    expect(view.submissions[0]).toMatchObject({ rank: 1, votes: 2 });

    // 再跑一次 cron:冪等,不會重複結算(結果不變)
    const ctx2 = createExecutionContext();
    worker.scheduled(createScheduledController({ scheduledTime: new Date(), cron: "*/5 * * * *" }), env, ctx2);
    await waitOnExecutionContext(ctx2);
    const again = await db.select().from(quests).where(eq(quests.id, questId)).get();
    expect(again?.settledAt?.getTime()).toBe(quest?.settledAt?.getTime());
  });
});

describe("審核管線(Workers AI moderation)", () => {
  const modQuestId = crypto.randomUUID();

  beforeAll(async () => {
    await db.insert(quests).values({
      id: modQuestId,
      creatorId: seeded.creatorId,
      title: "審核測試擂台",
      description: "-",
      status: "active",
      deadline: new Date(Date.now() + 3_600_000),
      createdAt: NOW,
    });
  });

  function envWithAi(run: () => Promise<unknown>): Cloudflare.Env {
    return {
      ...{
        DB: env.DB,
        TEST_MIGRATIONS: env.TEST_MIGRATIONS,
        RATE_LIMITER: env.RATE_LIMITER,
        QUEST_VOTES: env.QUEST_VOTES,
        TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
      },
      AI: { run } as unknown as Ai,
    };
  }

  async function submitWith(run: () => Promise<unknown>, ip: string) {
    mockTurnstile(true);
    const req = new Request(`https://api.local/quests/${modQuestId}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ content: "審核測試內容", turnstileToken: "ok" }),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, envWithAi(run), ctx);
    await waitOnExecutionContext(ctx);
    return (await res.json()) as { id: string; status: string };
  }

  it("AI 判 safe → approved,立即公開", async () => {
    const data = await submitWith(async () => ({ response: "safe" }), "10.0.3.1");
    expect(data.status).toBe("approved");
    const view = (await (await SELF.fetch(`https://api.local/quests/${modQuestId}`)).json()) as {
      submissions: Array<{ id: string }>;
    };
    expect(view.submissions.map((s) => s.id)).toContain(data.id);
  });

  it("AI 判 unsafe → flagged,不公開", async () => {
    const data = await submitWith(async () => ({ response: "unsafe\nS1" }), "10.0.3.2");
    expect(data.status).toBe("flagged");
    const view = (await (await SELF.fetch(`https://api.local/quests/${modQuestId}`)).json()) as {
      submissions: Array<{ id: string }>;
    };
    expect(view.submissions.map((s) => s.id)).not.toContain(data.id);
  });

  it("AI 呼叫失敗 → pending,不公開(fail-closed)", async () => {
    const data = await submitWith(async () => {
      throw new Error("AI down");
    }, "10.0.3.3");
    expect(data.status).toBe("pending");
  });

  it("AI 輸出讀不懂 → pending", async () => {
    const data = await submitWith(async () => ({ response: "???" }), "10.0.3.4");
    expect(data.status).toBe("pending");
  });
});
