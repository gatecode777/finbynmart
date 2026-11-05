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
