import { MongoClient, type Db } from "mongodb";
import { GraphStore } from "@karya/graph";

export type MongoContext = {
  client: MongoClient;
  db: Db;
  store: GraphStore;
};

export async function connectMongo(url: string): Promise<MongoContext> {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const store = new GraphStore(db);
  await store.ensureIndexes();
  return { client, db, store };
}
