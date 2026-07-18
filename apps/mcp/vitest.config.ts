import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // wrangler.jsonc 綁 service "tavern-api";stub worker 滿足 binding,
        // 行為測試改用 worker.fetch(req, mockEnv, ctx) 注入假 API
        workers: [
          {
            name: "tavern-api",
            modules: true,
            compatibilityDate: "2026-06-01",
            script: `export default { fetch() { return Response.json({ quests: [] }); } };`,
          },
        ],
      },
    }),
  ],
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          // MCP SDK 拉進的 CJS 依賴(ajv)要先由 Vite 打包成 ESM 才能進 workerd;
          // ajv 因 pnpm 隔離需列為本 workspace 的 devDependency 才解析得到
          include: ["ajv", "ajv-formats"],
        },
      },
    },
  },
});
