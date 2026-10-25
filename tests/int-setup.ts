import { execSync } from "node:child_process";

/** Rebuild the integration-test database from migrations. Refuses anything not named *_test. */
export default function setup() {
  const url = process.env.INT_TEST_DATABASE_URL;
  if (!url) throw new Error("INT_TEST_DATABASE_URL not set (run via vitest.int.config.ts)");
  const db = new URL(url).pathname.replace(/^\//, "");
  if (!db.endsWith("_test")) throw new Error(`Refusing to reset "${db}": integration tests only reset databases named *_test`);
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
