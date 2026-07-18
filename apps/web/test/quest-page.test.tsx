import { describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import app from "../src/index.js";
import type { QuestView } from "../src/views.js";

const DAY_MS = 86_400_000;

function mockEnv(handler: (req: Request) => Response | Promise<Response>): Env {
  return {
    API: { fetch: handler } as unknown as Env["API"],
    TURNSTILE_SITE_KEY: "test-sitekey",
  };
}

function questView(overrides: Partial<QuestView["quest"]> = {}): QuestView {
  const now = Date.now();
  return {
    quest: {
      id: "q1",
      title: "測試擂台標題",
      description: "把這段題目貼給你的 AI",
      status: "active",
      deadline: new Date(now + 7 * DAY_MS).toISOString(),
      createdAt: new Date(now).toISOString(),
      ...overrides,
    },
    submissions: [
      {
        id: "s1",
        content: "第一件作品內容",
        authorName: "吟遊詩人",
        votes: 2,
        createdAt: new Date(now).toISOString(),
      },
      {
        id: "s2",
        content: "第二件作品內容",
        authorName: "冒險者",
        votes: 0,
        createdAt: new Date(now).toISOString(),
      },
    ],
  };
}

describe("GET /(公告板)", () => {
  it("列出進行中的擂台", async () => {
    const env = mockEnv(() =>
      Response.json({
        quests: [
          {
            id: "q1",
            title: "測試擂台標題",
            deadline: new Date(Date.now() + DAY_MS).toISOString(),
            submissionCount: 3,
          },
        ],
      }),
    );
    const res = await app.request("/", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("測試擂台標題");
    expect(html).toContain("/quests/q1");
    expect(html).toContain("3 件參賽作品");
  });

  it("沒有擂台時顯示空狀態", async () => {
    const env = mockEnv(() => Response.json({ quests: [] }));
    const html = await (await app.request("/", {}, env)).text();
    expect(html).toContain("目前沒有進行中的擂台");
  });
});

describe("GET /quests/:id(擂台頁)", () => {
  it("進行中:題目、複製按鈕、作品、投票與參賽表單、Turnstile", async () => {
    const env = mockEnv(() => Response.json(questView()));
    const res = await app.request("/quests/q1", {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("測試擂台標題");
    expect(html).toContain("把這段題目貼給你的 AI");
    expect(html).toContain("複製題目");
    expect(html).toContain("第一件作品內容");
    expect(html).toContain("2 票");
    expect(html).toContain(`action="/quests/q1/votes"`);
    expect(html).toContain(`action="/quests/q1/submissions"`);
    expect(html).toContain(`data-sitekey="test-sitekey"`);
    expect(html).toContain("challenges.cloudflare.com/turnstile");
  });

  it("已結束(settled):隱藏表單、顯示已結束文案", async () => {
    const env = mockEnv(() => Response.json(questView({ status: "settled" })));
    const html = await (await app.request("/quests/q1", {}, env)).text();
    expect(html).toContain("已經結束");
    expect(html).not.toContain("action=");
    expect(html).not.toContain("data-sitekey");
    expect(html).toContain("第一件作品內容"); // 作品仍照常顯示
  });

  it("已過截止但尚未結算:同樣不開放表單", async () => {
    const env = mockEnv(() =>
      Response.json(questView({ deadline: new Date(Date.now() - 1000).toISOString() })),
    );
    const html = await (await app.request("/quests/q1", {}, env)).text();
    expect(html).not.toContain("action=");
  });

  it("flash:?ok=voted 與 ?err=already-voted 顯示對應繁中訊息", async () => {
    const env = mockEnv(() => Response.json(questView()));
    const okHtml = await (await app.request("/quests/q1?ok=voted", {}, env)).text();
    expect(okHtml).toContain("投票成功");
    const errHtml = await (await app.request("/quests/q1?err=already-voted", {}, env)).text();
    expect(errHtml).toContain("你已經投過票了");
  });

  it("API 404 → 繁中 404 頁", async () => {
    const env = mockEnv(() =>
      Response.json({ error: { code: "quest-not-found" } }, { status: 404 }),
    );
    const res = await app.request("/quests/nope", {}, env);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("找不到這個擂台");
  });
});

describe("POST 轉發(web → API)", () => {
  it("提交:form 轉 JSON、轉發 cookie/IP、成功 303 ?ok=submitted 並回傳 Set-Cookie", async () => {
    let captured: { url: string; body: unknown; cookie: string | null; ip: string | null } | null =
      null;
    const env = mockEnv(async (req) => {
      captured = {
        url: req.url,
        body: await req.json(),
        cookie: req.headers.get("cookie"),
        ip: req.headers.get("cf-connecting-ip"),
      };
      return Response.json(
        { id: "new-sub" },
        { status: 201, headers: { "set-cookie": "tavern_uid=abc; Path=/" } },
      );
    });

    const form = new URLSearchParams({
      content: "AI 的回答",
      displayName: "測試詩人",
      "cf-turnstile-response": "token123",
    });
    const res = await app.request(
      "/quests/q1/submissions",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "tavern_uid=old",
          "cf-connecting-ip": "1.2.3.4",
        },
        body: form,
      },
      env,
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/quests/q1?ok=submitted");
    expect(res.headers.get("set-cookie")).toBe("tavern_uid=abc; Path=/");
    expect(captured).toEqual({
      url: "https://tavern-api/quests/q1/submissions",
      body: { content: "AI 的回答", displayName: "測試詩人", turnstileToken: "token123" },
      cookie: "tavern_uid=old",
      ip: "1.2.3.4",
    });
  });

  it("投票失敗:API 409 already-voted → 303 ?err=already-voted", async () => {
    const env = mockEnv(() =>
      Response.json(
        { error: { code: "already-voted", message: "你已經投過票了,一人一票喔" } },
        { status: 409 },
      ),
    );
    const res = await app.request(
      "/quests/q1/votes",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ submissionId: "s1", "cf-turnstile-response": "t" }),
      },
      env,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/quests/q1?err=already-voted");
  });
});
