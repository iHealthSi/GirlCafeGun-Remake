import { describe, expect, it } from "vitest";
import { lookupCached, rememberResponse } from "../src/servers/response-cache.js";

type Entry = { response: string; expiresAt: number };

describe("response cache", () => {
  it("drops expired entries and returns a live one", () => {
    const map = new Map<string, Entry>();
    rememberResponse(map, "old", { response: "a" }, 100);
    rememberResponse(map, "live", { response: "b" }, 500);

    expect(lookupCached(map, "old", 100)).toBeUndefined();
    expect(map.has("old")).toBe(false);
    expect(lookupCached(map, "live", 100)?.response).toBe("b");
    expect(lookupCached(map, null, 100)).toBeUndefined();
    expect(lookupCached(map, "live", 500)).toBeUndefined();
    expect(map.size).toBe(0);
  });

  it("keeps at most 64 entries and drops the oldest first", () => {
    const map = new Map<string, Entry>();
    for (let i = 0; i < 65; i += 1) {
      rememberResponse(map, `k${i}`, { response: String(i) }, 1_000);
    }
    expect(map.size).toBe(64);
    expect(map.has("k0")).toBe(false);
    expect(map.has("k1")).toBe(true);
    expect(map.has("k64")).toBe(true);
  });
});
