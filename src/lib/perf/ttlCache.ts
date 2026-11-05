import { markCache } from "./context";

/**
 * A small in-process cache for PUBLIC, read-only data (never personal data), with request coalescing.
 *
 *  - Entries live for `ttlMs`. A value is served from memory until then; after that the next request loads it again.
 *  - Coalescing: while a load is running, every other request for the same key waits for that one load instead of starting
 *    its own, so a burst after expiry costs one database round trip, not one per request.
 *  - A failed load is not cached (the error reaches the callers that waited for it, and the next request tries again).
 *  - The cache is per process. Where the application runs on several instances each has its own copy, so a change made
 *    through another instance is visible after at most `ttlMs`. Writers in the SAME process call `delete`/`clear` so
 *    their own change shows at once.
 *  - TTL 0 switches the cache off (used by the functional test server, whose tests edit the database directly).
 *
 * Staleness policy and invalidation triggers per cache are listed in docs/performance/API_CACHE_STRATEGY.md.
 */
interface Entry<T> {
  value?: T;
  expires: number;
  loading?: Promise<T>;
}

export interface TtlCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

export function ttlSetting(name: string, fallbackMs: number): number {
  const raw = process.env[name] ?? process.env.FINBYN_PUBLIC_CACHE_MS;
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallbackMs;
}

export function createTtlCache<T>(options: { name: string; ttlMs: number; maxEntries?: number }): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();
  const max = options.maxEntries ?? 500;

  return {
    async get(key, load) {
      if (options.ttlMs <= 0) return load();
      const now = Date.now();
      const entry = entries.get(key);
      if (entry?.value !== undefined && entry.expires > now) {
        markCache("hit");
        return entry.value;
      }
      if (entry?.loading) {
        markCache("miss");
        return entry.loading;
      }
      markCache("miss");
      const loading = load().then(
        (value) => {
          // Insertion order is age order, so the oldest entries go first when the cache is full.
          if (entries.size >= max) entries.delete(entries.keys().next().value as string);
          entries.set(key, { value, expires: Date.now() + options.ttlMs });
          return value;
        },
        (error) => {
          entries.delete(key);
          throw error;
        },
      );
      entries.set(key, { expires: 0, loading });
      return loading;
    },
    delete: (key) => void entries.delete(key),
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}

/** Gives a slow optional lookup (a count or a headline shown in a tab) a time limit, so it can never hold a page back. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A bounded, least-recently-used cache with a lifetime, for synchronous results computed from data that cannot change
 * while the process runs (the catalogue). Reads refresh an entry's position; the least recently used goes first when full.
 */
export interface LruCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
  size(): number;
}

export function createLruCache<T>(options: { name: string; max: number; ttlMs: number }): LruCache<T> {
  const entries = new Map<string, { value: T; expires: number }>();
  return {
    get(key) {
      if (options.ttlMs <= 0) return undefined;
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      if (options.ttlMs <= 0) return;
      entries.delete(key);
      if (entries.size >= options.max) entries.delete(entries.keys().next().value as string);
      entries.set(key, { value, expires: Date.now() + options.ttlMs });
    },
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}
