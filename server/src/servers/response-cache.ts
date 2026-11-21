export const RESPONSE_CACHE_MAX_ENTRIES = 64;

export interface CachedEntry {
  expiresAt: number;
}

/** Drops every expired entry, then returns the live entry for `key`, if any. */
export function lookupCached<V extends CachedEntry>(
  map: Map<string, V>,
  key: string | null | undefined,
  now: number,
): V | undefined {
  for (const [id, entry] of map) {
    if (entry.expiresAt <= now) map.delete(id);
  }
  return key ? map.get(key) : undefined;
}

/** Stores a response and keeps at most 64 entries, dropping the oldest first. */
export function rememberResponse<V extends CachedEntry>(
  map: Map<string, V>,
  key: string,
  value: Omit<V, "expiresAt">,
  expiresAt: number,
): void {
  map.delete(key);
  map.set(key, { ...value, expiresAt } as V);
  while (map.size > RESPONSE_CACHE_MAX_ENTRIES) {
    map.delete(map.keys().next().value!);
  }
}
