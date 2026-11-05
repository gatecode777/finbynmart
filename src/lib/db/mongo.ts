import { MongoClient, type Db } from "mongodb";
import { addDb } from "@/lib/perf/context";

const globalForMongo = globalThis as unknown as { __finbynMongo?: Promise<MongoClient> };

/**
 * One shared client per process (it survives dev hot reloads), so a request never opens its own connection.
 * Pool and timeouts are set explicitly: at most 20 connections, and an operation that hangs fails after 20 seconds
 * instead of holding a request open for ever.
 */
const OPTIONS = { maxPoolSize: 20, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, socketTimeoutMS: 20_000, maxIdleTimeMS: 60_000 };

const timed = <T>(promise: Promise<T>): Promise<T> => {
  const t0 = performance.now();
  return promise.finally(() => addDb(performance.now() - t0));
};

const isThenable = (value: unknown): value is Promise<unknown> => Boolean(value) && typeof (value as { then?: unknown }).then === "function";
const CURSOR_READS = new Set(["toArray", "next", "hasNext", "tryNext", "forEach"]);

/** A cursor whose reading methods are timed; chaining methods (sort, limit, project...) keep returning the timed cursor. */
function timedCursor<C extends object>(cursor: C): C {
  const proxy: C = new Proxy(cursor, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const out = value.apply(target, args);
        if (CURSOR_READS.has(String(prop)) && isThenable(out)) return timed(out);
        return out === target ? receiver : out;
      };
    },
  });
  return proxy;
}

/** A collection whose operations report their duration to the current request (see lib/perf). Behaviour is unchanged. */
function timedCollection<C extends object>(collection: C): C {
  return new Proxy(collection, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const out = value.apply(target, args);
        if (isThenable(out)) return timed(out);
        if (out && typeof out === "object" && typeof (out as { toArray?: unknown }).toArray === "function") return timedCursor(out);
        return out;
      };
    },
  });
}

function timedDb(db: Db): Db {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "collection" && typeof value === "function") return (...args: unknown[]) => timedCollection((value as (...a: unknown[]) => object).apply(target, args));
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Server-only. */
export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example)");

  globalForMongo.__finbynMongo ??= new MongoClient(uri, OPTIONS).connect();
  const client = await globalForMongo.__finbynMongo.catch((error) => {
    globalForMongo.__finbynMongo = undefined;
    throw error;
  });
  return timedDb(client.db(process.env.MONGODB_DB ?? "finbynmart"));
}
