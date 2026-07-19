import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    fileURLToPath(new URL("../../packages/db/migrations", import.meta.url)),
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // AI binding 預設會連遠端真資源(非確定性、CI 無憑證)——測試一律關掉,
        // 走 fail-closed(pending);safe/unsafe 路徑用 worker.fetch 注入假 AI 測
        remoteBindings: false,
        miniflare: {
          // TURNSTILE_SECRET_KEY 正式值是 wrangler secret;測試裡 siteverify 被 stub,值不重要
          bindings: { TEST_MIGRATIONS: migrations, TURNSTILE_SECRET_KEY: "test-secret" },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
    },
  };
});
