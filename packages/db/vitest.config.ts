import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // 在 node 端讀出 migration SQL,經 binding 傳進 workerd,由 test/setup.ts 套用
  const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));

  return {
    plugins: [
      cloudflareTest({
        // 注意:0.18 的 plugin API 已無 isolatedStorage,測試間共用同一個 D1,
        // 測試檔內只 seed 一次、各測試用獨立的隨機資料避免互撞。
        miniflare: {
          compatibilityDate: "2026-06-01",
          d1Databases: ["DB"],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
    },
  };
});
