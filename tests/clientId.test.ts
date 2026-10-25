import { describe, it, expect, vi, afterEach } from "vitest";
import { newId } from "../src/lib/clientId";

describe("newId", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("makes a v4 UUID even where crypto.randomUUID is missing (http on a phone)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const ids = new Set(Array.from({ length: 50 }, newId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
