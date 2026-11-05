import { newContext, runWithPerf, type PerfContext } from "./context";

/**
 * Request instrumentation for route handlers and pages.
 *
 *  - Always on: a slow request (over FINBYN_SLOW_MS, default 800 ms) writes one warning line with its route, status,
 *    total and database time. No query string, no body, no cookie, no user data: only the route NAME.
 *  - FINBYN_PERF=1 (set when measuring): every request writes one JSON line, and route handlers add a Server-Timing
 *    header (total, db, and the named stages) and an X-Request-Id, so a client can see where the time went.
 *
 * Page timings cover the page function (its data loading and the creation of the page tree); streaming and the browser
 * are outside it, so a page figure is a lower bound of what a visitor waits for.
 */
const SLOW_MS = Number(process.env.FINBYN_SLOW_MS) || 800;
const verbose = () => process.env.FINBYN_PERF === "1";

function line(kind: "api" | "page", name: string, context: PerfContext, total: number, status: number, bytes: number | null, error?: string) {
  const record = {
    type: "perf",
    kind,
    route: name,
    status,
    totalMs: Math.round(total * 10) / 10,
    dbMs: Math.round(context.dbMs * 10) / 10,
    dbOps: context.dbOps,
    stages: Object.fromEntries(Object.entries(context.stages).map(([key, value]) => [key, Math.round(value * 10) / 10])),
    bytes,
    cache: context.cache,
    id: context.id,
    ...(error ? { error } : {}),
  };
  if (total > SLOW_MS) console.warn(JSON.stringify({ ...record, type: "slow_route", thresholdMs: SLOW_MS }));
  else if (verbose()) console.log(JSON.stringify(record));
}

/** Wraps a route handler. The handler's own signature is kept, so Next.js sees the same function. */
export function withApiPerf<A extends unknown[]>(name: string, handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const context = newContext();
    return runWithPerf(context, async () => {
      try {
        const response = await handler(...args);
        const total = performance.now() - context.start;
        if (verbose()) {
          const stages = Object.entries(context.stages).map(([key, value]) => `${key};dur=${value.toFixed(1)}`);
          response.headers.set("Server-Timing", [`total;dur=${total.toFixed(1)}`, `db;dur=${context.dbMs.toFixed(1)};desc="${context.dbOps} ops"`, ...stages].join(", "));
          response.headers.set("X-Request-Id", context.id);
        }
        line("api", name, context, total, response.status, Number(response.headers.get("content-length")) || null);
        return response;
      } catch (error) {
        line("api", name, context, performance.now() - context.start, 500, null, (error as Error).name);
        throw error;
      }
    });
  };
}

/** Wraps a page's default export (a server component function). */
export function withPagePerf<A extends unknown[], R>(name: string, page: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const context = newContext();
    return runWithPerf(context, async () => {
      try {
        const result = await page(...args);
        line("page", name, context, performance.now() - context.start, 200, null);
        return result;
      } catch (error) {
        // notFound() and redirect() are control flow, not failures.
        const digest = (error as { digest?: string }).digest ?? "";
        line("page", name, context, performance.now() - context.start, digest.startsWith("NEXT_REDIRECT") ? 307 : digest.includes("NOT_FOUND") ? 404 : 500, null, digest ? undefined : (error as Error).name);
        throw error;
      }
    });
  };
}
