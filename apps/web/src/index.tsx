import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "./env.js";
import {
  HomePage,
  NotFoundPage,
  QuestPage,
  type QuestSummary,
  type QuestView,
} from "./views.js";

const app = new Hono<{ Bindings: Env }>();

type Ctx = Context<{ Bindings: Env }>;

function apiGet(c: Ctx, path: string): Promise<Response> {
  return c.env.API.fetch(new Request(`https://tavern-api${path}`));
}

function apiPost(c: Ctx, path: string, body: unknown): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  const cookie = c.req.header("cookie");
  if (cookie) headers.set("cookie", cookie);
  const ip = c.req.header("cf-connecting-ip");
  if (ip) headers.set("cf-connecting-ip", ip);
  return c.env.API.fetch(
    new Request(`https://tavern-api${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

/** PRG:依 API 結果 303 回擂台頁帶 flash,並把 API 的 Set-Cookie 轉回瀏覽器 */
async function redirectBack(
  c: Ctx,
  questId: string,
  apiRes: Response,
  okFlag: string,
): Promise<Response> {
  let location = `/quests/${questId}?ok=${okFlag}`;
  if (!apiRes.ok) {
    let code = "invalid-request";
    try {
      const data = (await apiRes.json()) as { error?: { code?: string } };
      if (data.error?.code) code = data.error.code;
    } catch {
      // API 回了非 JSON(不預期),就用預設錯誤碼
    }
    location = `/quests/${questId}?err=${code}`;
  }
  const res = c.redirect(location, 303);
  const setCookie = apiRes.headers.get("set-cookie");
  if (setCookie) res.headers.set("set-cookie", setCookie);
  return res;
}

app.get("/", async (c) => {
  const res = await apiGet(c, "/quests");
  const data = (await res.json()) as { quests: QuestSummary[] };
  return c.html(<HomePage quests={data.quests} now={new Date()} />);
});

app.get("/quests/:id", async (c) => {
  const res = await apiGet(c, `/quests/${c.req.param("id")}`);
  if (!res.ok) return c.html(<NotFoundPage />, 404);
  const view = (await res.json()) as QuestView;
  return c.html(
    <QuestPage
      view={view}
      now={new Date()}
      siteKey={c.env.TURNSTILE_SITE_KEY}
      ok={c.req.query("ok")}
      err={c.req.query("err")}
    />,
  );
});

app.post("/quests/:id/submissions", async (c) => {
  const questId = c.req.param("id");
  const form = await c.req.formData();
  const displayName = String(form.get("displayName") ?? "").trim();
  const apiRes = await apiPost(c, `/quests/${questId}/submissions`, {
    content: String(form.get("content") ?? ""),
    ...(displayName ? { displayName } : {}),
    turnstileToken: String(form.get("cf-turnstile-response") ?? ""),
  });
  // 審核結果決定 flash:approved 立即公開,其餘顯示「審核中」
  let okFlag = "submitted";
  if (apiRes.ok) {
    try {
      const data = (await apiRes.clone().json()) as { status?: string };
      if (data.status !== "approved") okFlag = "submitted-pending";
    } catch {
      // 讀不到就用預設文案
    }
  }
  return redirectBack(c, questId, apiRes, okFlag);
});

app.post("/quests/:id/votes", async (c) => {
  const questId = c.req.param("id");
  const form = await c.req.formData();
  const apiRes = await apiPost(c, `/quests/${questId}/votes`, {
    submissionId: String(form.get("submissionId") ?? ""),
    turnstileToken: String(form.get("cf-turnstile-response") ?? ""),
  });
  return redirectBack(c, questId, apiRes, "voted");
});

app.notFound((c) => c.html(<NotFoundPage />, 404));

export default app;
