import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";
import type { Env } from "./env.js";

const SERVER_INFO = { name: "quest-tavern", version: "0.1.0" };

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function errorResult(res: Response): Promise<ToolResult> {
  const fallback = "查詢失敗,請稍後再試";
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return {
    content: [{ type: "text", text: data?.error?.message ?? fallback }],
    isError: true,
  };
}

/** tools 一律經 service binding 呼叫 tavern-api(與 web 相同模式) */
function buildServer(env: Env): McpServer {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    "browse_quests",
    {
      title: "Browse open quests",
      description:
        "List the arena quests (creative challenges) currently open on 任務酒館 Quest Tavern. " +
        "Returns each quest's id, title, deadline and submission count. " +
        "Use get_quest with a quest id to see the full challenge.",
      inputSchema: {},
    },
    async () => {
      const res = await env.API.fetch(new Request("https://tavern-api/quests"));
      if (!res.ok) return errorResult(res);
      return jsonResult(await res.json());
    },
  );

  server.registerTool(
    "get_quest",
    {
      title: "Get quest details",
      description:
        "Get one quest's full details from 任務酒館 Quest Tavern: the challenge prompt to give an AI, " +
        "the deadline, and all public submissions with vote counts (and final ranking once settled).",
      inputSchema: {
        quest_id: z.string().min(1).describe("The quest id, e.g. from browse_quests"),
      },
    },
    async ({ quest_id }) => {
      const res = await env.API.fetch(
        new Request(`https://tavern-api/quests/${encodeURIComponent(quest_id)}`),
      );
      if (!res.ok) return errorResult(res);
      return jsonResult(await res.json());
    },
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Promise.resolve(Response.json({ ok: true, service: "mcp" }));
    }
    return createMcpHandler(buildServer(env), { route: "/mcp" })(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
