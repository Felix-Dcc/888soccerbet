import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

/**
 * Integration tests run against their OWN database (<dev db name>_test, or TEST_DATABASE_URL),
 * rebuilt from migrations before every run, so they never touch development data.
 */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  let dev = process.env.DATABASE_URL;
  if (!dev) {
    const m = readFileSync(resolve(__dirname, ".env"), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m);
    dev = m?.[1];
  }
  if (!dev) throw new Error("Set DATABASE_URL or TEST_DATABASE_URL to run integration tests");
  const url = new URL(dev);
  url.pathname = `${url.pathname.replace(/^\//, "")}_test`;
  return url.toString();
}

const TEST_DATABASE_URL = testDatabaseUrl();
// globalSetup runs in this process (not the test workers), so it reads this, not test.env.
process.env.INT_TEST_DATABASE_URL = TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.int.ts"],
    globalSetup: ["tests/int-setup.ts"],
    // Stake/deposit/withdrawal limits live in the PlatformSettings row; tests/integration.int.ts pins them.
    env: { DATABASE_URL: TEST_DATABASE_URL },
    // Shared ledger invariant: run serially.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30000,
    hookTimeout: 120000,
  },
  // "server-only" is Next's build-time marker; outside Next it must resolve to its no-op module.
  resolve: { alias: { "@": resolve(__dirname, "src"), "server-only": resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js") } },
});
