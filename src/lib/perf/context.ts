import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request timing. One context is opened for each instrumented route or page (see instrument.ts); every MongoDB call
 * made while it is open adds its duration here (see timedDb in lib/db/mongo.ts). Nothing in it identifies a person:
 * only counts and milliseconds.
 */
export interface PerfContext {
  id: string;
  start: number;
  /** Milliseconds spent waiting for MongoDB, summed over operations (concurrent operations add up). */
  dbMs: number;
  dbOps: number;
  /** Named parts of the request, in milliseconds. */
  stages: Record<string, number>;
  cache: "hit" | "miss" | "none";
}

const storage = new AsyncLocalStorage<PerfContext>();

export const currentPerf = (): PerfContext | undefined => storage.getStore();

export function newContext(): PerfContext {
  return { id: Math.random().toString(36).slice(2, 10), start: performance.now(), dbMs: 0, dbOps: 0, stages: {}, cache: "none" };
}

export const runWithPerf = <T>(context: PerfContext, fn: () => T): T => storage.run(context, fn);

export function addDb(ms: number): void {
  const context = storage.getStore();
  if (!context) return;
  context.dbMs += ms;
  context.dbOps += 1;
}

export function markCache(state: "hit" | "miss"): void {
  const context = storage.getStore();
  if (context && context.cache !== "miss") context.cache = state;
}

/** Times one named part of the current request. Works (and costs nothing) outside a request too. */
export async function stage<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const context = storage.getStore();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    if (context) context.stages[name] = (context.stages[name] ?? 0) + (performance.now() - t0);
  }
}

/** Adds a measured duration to a named stage of the current request (for synchronous work). */
export function addStage(name: string, ms: number): void {
  const context = storage.getStore();
  if (context) context.stages[name] = (context.stages[name] ?? 0) + ms;
}
