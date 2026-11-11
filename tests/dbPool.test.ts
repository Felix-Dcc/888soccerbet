import { describe, expect, it } from "vitest";
import { pooledUrl } from "../src/lib/db";

describe("pooledUrl", () => {
  const base = "postgresql://user:p%40ss%3Aw0rd@postgres.railway.internal:5432/railway";

  it("caps the pool: 15 for the web server, 5 for the worker, with a 30 s wait", () => {
    const web = new URL(pooledUrl(base, undefined)!);
    expect(web.searchParams.get("connection_limit")).toBe("15");
    expect(web.searchParams.get("pool_timeout")).toBe("30");
    expect(new URL(pooledUrl(base, "worker")!).searchParams.get("connection_limit")).toBe("5");
  });

  it("keeps the credentials and host exactly, and respects limits already in the URL", () => {
    const out = pooledUrl(`${base}?schema=public&connection_limit=3`, undefined)!;
    expect(out.startsWith(base)).toBe(true); // percent-encoded password untouched
    const u = new URL(out);
    expect(u.searchParams.get("connection_limit")).toBe("3");
    expect(u.searchParams.get("schema")).toBe("public");
    expect(pooledUrl(undefined)).toBeUndefined();
  });
});
