import { getDb } from "@/lib/db/mongo";

/**
 * Fixed-window rate limiter backed by MongoDB, so the limit holds across serverless instances.
 * Each window is one document; a TTL index on `expireAt` removes old windows.
 *
 * Fails open: if the database is unreachable the request is allowed (the route's own database
 * call will then fail and report the problem), because a limiter outage should not take the site down.
 */
interface WindowDoc {
  _id: string;
  count: number;
  expireAt: Date;
}

let indexReady: Promise<unknown> | undefined;

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  try {
    const collection = (await getDb()).collection<WindowDoc>("rate_limits");
    indexReady ??= collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
    await indexReady;

    const now = Date.now();
    const bucket = Math.floor(now / (windowSeconds * 1000));
    const windowEnd = (bucket + 1) * windowSeconds * 1000;
    const doc = await collection.findOneAndUpdate(
      { _id: `${key}:${bucket}` },
      { $inc: { count: 1 }, $setOnInsert: { expireAt: new Date(windowEnd + 60_000) } },
      { upsert: true, returnDocument: "after" },
    );
    const count = doc?.count ?? 1;
    return { ok: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)) };
  } catch (error) {
    console.error("rate limiter unavailable", error);
    return { ok: true, retryAfterSeconds: 0 };
  }
}

/** Best-effort client address from the proxy headers (trusted on Vercel). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/**
 * The same fixed-window limit, with far fewer database round trips, for PUBLIC READ routes.
 *
 * The instance reserves a block of the allowance from MongoDB (one write that adds the block to the shared counter) and then
 * serves the next requests of that client from the block, without touching the database. Because the shared counter is
 * advanced BEFORE the tokens are used, the total granted across all instances in a window can never exceed the limit: the
 * only cost of a block is that tokens a client reserved but did not use are not available to it elsewhere in that window.
 * The block is 1/12 of the limit (at least 1), so a client that sends one request wastes at most that much.
 *
 * Writes, sign-in and registration keep using rateLimit() above (one database write per attempt): they are the routes where
 * a stale or approximate count would matter.
 */
interface Reservation {
  bucket: number;
  tokens: number;
}

const reservations = new Map<string, Reservation>();
const MAX_RESERVATIONS = 20_000;

export async function rateLimitReserved(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const windowEnd = (bucket + 1) * windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000));

  const held = reservations.get(key);
  if (held && held.bucket === bucket && held.tokens > 0) {
    held.tokens -= 1;
    return { ok: true, retryAfterSeconds };
  }

  const block = Math.max(1, Math.floor(limit / 12));
  try {
    const collection = (await getDb()).collection<WindowDoc>("rate_limits");
    indexReady ??= collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
    await indexReady;
    const doc = await collection.findOneAndUpdate(
      { _id: `${key}:${bucket}` },
      { $inc: { count: block }, $setOnInsert: { expireAt: new Date(windowEnd + 60_000) } },
      { upsert: true, returnDocument: "after" },
    );
    const before = (doc?.count ?? block) - block;
    const granted = Math.min(block, limit - before);
    if (granted <= 0) {
      reservations.delete(key);
      return { ok: false, retryAfterSeconds };
    }
    if (reservations.size >= MAX_RESERVATIONS) reservations.clear();
    reservations.set(key, { bucket, tokens: granted - 1 });
    return { ok: true, retryAfterSeconds };
  } catch (error) {
    console.error("rate limiter unavailable", error);
    return { ok: true, retryAfterSeconds: 0 };
  }
}

// ---------- bounded limiter for public READ endpoints (search) ----------
/**
 * The database limiter normally decides. It is given a DEADLINE (default 1.5 s): when the database is slow or down the request is NOT held for the driver's 8 s connection wait.
 * Degraded policy (explicit, documented in docs/performance/SEARCH_RELIABILITY.md): abuse protection is never switched off; the instance falls back to a per-instance in-memory
 * counter with a STRICTER ceiling (a quarter of the normal limit, at least 10) and, after a failure, skips the database for 10 s so later requests are not delayed at all.
 * The limit is per instance while degraded, so it is weaker than the shared one: that is the accepted trade-off for keeping read-only catalogue pages answering.
 */
const localWindows = new Map<string, { bucket: number; count: number }>();
let dbSkipUntil = 0;
export const LIMITER_DEADLINE_MS = 1500;
export const LIMITER_SKIP_MS = 10_000;

export async function boundedRateLimit(key: string, limit: number, windowSeconds: number, deadlineMs = LIMITER_DEADLINE_MS): Promise<{ ok: boolean; retryAfterSeconds: number; degraded: boolean }> {
  const now = Date.now();
  if (now >= dbSkipUntil) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), deadlineMs); });
    const real = rateLimitReserved(key, limit, windowSeconds);
    const winner = await Promise.race([real, timeout]);
    if (timer) clearTimeout(timer);
    // rateLimitReserved fails open with retryAfterSeconds 0 when the database errored: treat that as degraded too
    if (winner !== "timeout" && winner.retryAfterSeconds !== 0) return { ...winner, degraded: false };
    if (winner !== "timeout") dbSkipUntil = Date.now() + LIMITER_SKIP_MS;
    else { dbSkipUntil = Date.now() + LIMITER_SKIP_MS; void real.catch(() => undefined); }
  }
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const retryAfterSeconds = Math.max(1, Math.ceil(((bucket + 1) * windowSeconds * 1000 - now) / 1000));
  const w = localWindows.get(key);
  const cur = w && w.bucket === bucket ? w : { bucket, count: 0 };
  cur.count += 1;
  if (localWindows.size > 20_000) localWindows.clear();
  localWindows.set(key, cur);
  return { ok: cur.count <= Math.max(10, Math.floor(limit / 4)), retryAfterSeconds, degraded: true };
}
