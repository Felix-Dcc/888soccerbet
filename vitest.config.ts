import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Pure-logic tests run anywhere. Integration tests (*.int.ts) need a migrated DB and
    // are run explicitly: `npm run test:int`.
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
