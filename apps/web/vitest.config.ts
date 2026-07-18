import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // wrangler.jsonc 綁了 service "tavern-api";測試裡用 stub worker 滿足 binding。
        // 行為測試不走 SELF,改用 app.request(path, init, mockEnv) 注入假 API。
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
});
