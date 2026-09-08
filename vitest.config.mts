import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    // The integration tests open real connections and race transactions.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests share one database; running their files in parallel
    // would let unrelated suites interleave against the same rows.
    fileParallelism: false,
  },
});
