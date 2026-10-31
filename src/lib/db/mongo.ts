import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as unknown as { __finbynMongo?: Promise<MongoClient> };

/** Server-only. One shared client per process (survives dev hot reloads). */
export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (see .env.example)");

  globalForMongo.__finbynMongo ??= new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect();
  const client = await globalForMongo.__finbynMongo.catch((error) => {
    globalForMongo.__finbynMongo = undefined;
    throw error;
  });
  return client.db(process.env.MONGODB_DB ?? "finbynmart");
}
