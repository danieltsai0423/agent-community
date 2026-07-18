import { createExecutionContext } from "cloudflare:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import worker from "../src/index.js";

const QUESTS_FIXTURE = {
  quests: [
    { id: "q1", title: "測試擂台", deadline: "2026-08-01T00:00:00.000Z", submissionCount: 2 },
  ],
};

const QUEST_FIXTURE = {
  quest: { id: "q1", title: "測試擂台", status: "active" },
  submissions: [{ id: "s1", content: "作品", authorName: "詩人", votes: 1, rank: null }],
};

/** 假 API + 自訂 fetch:MCP client 直接打 worker.fetch,不經網路 */
function makeClientTransport(apiHandler: (req: Request) => Response | Promise<Response>) {
  const env: Env = { API: { fetch: apiHandler } as unknown as Fetcher };
  const customFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = (input instanceof Request && !init ? input : new Request(input, init)) as Parameters<
      typeof worker.fetch
    >[0];
    return worker.fetch(req, env, createExecutionContext());
  }) as typeof fetch;
  return new StreamableHTTPClientTransport(new URL("https://tavern-mcp/mcp"), {
    fetch: customFetch,
  });
}

function defaultApiStub(req: Request): Response {
  const path = new URL(req.url).pathname;
  if (path === "/quests") return Response.json(QUESTS_FIXTURE);
  if (path === "/quests/q1") return Response.json(QUEST_FIXTURE);
  return Response.json(
    { error: { code: "quest-not-found", message: "找不到這個擂台" } },
    { status: 404 },
  );
}

async function connectedClient(apiHandler = defaultApiStub) {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(makeClientTransport(apiHandler));
  return client;
}

function firstText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text: string }> }).content;
  return content?.[0]?.text ?? "";
}

describe("tavern-mcp(streamable HTTP)", () => {
  it("health endpoint", async () => {
    const res = await worker.fetch(
      new Request("https://tavern-mcp/health"),
      { API: { fetch: defaultApiStub } as unknown as Fetcher },
      createExecutionContext(),
    );
    expect(await res.json()).toEqual({ ok: true, service: "mcp" });
  });

  it("initialize → tools/list 有 browse_quests 與 get_quest", async () => {
    const client = await connectedClient();
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["browse_quests", "get_quest"]);
    await client.close();
  });

  it("browse_quests 回傳 API 的擂台列表", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "browse_quests", arguments: {} });
    expect(JSON.parse(firstText(result))).toEqual(QUESTS_FIXTURE);
    await client.close();
  });

  it("get_quest 回傳題目與作品", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_quest", arguments: { quest_id: "q1" } });
    expect(JSON.parse(firstText(result))).toEqual(QUEST_FIXTURE);
    await client.close();
  });

  it("get_quest 不存在 → isError + 繁中訊息", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_quest", arguments: { quest_id: "nope" } });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("找不到這個擂台");
    await client.close();
  });
});
