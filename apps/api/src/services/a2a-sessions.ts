import type { Db } from "mongodb";
import type { A2ASessionDocument } from "@karya/a2a";
import { ensureA2AIndexes } from "../mongo.js";

export { ensureA2AIndexes };

function collection(db: Db) {
  return db.collection<A2ASessionDocument>("a2a_sessions");
}

export async function insertSession(
  db: Db,
  doc: A2ASessionDocument,
): Promise<void> {
  await collection(db).insertOne(doc);
}

export async function getSession(
  db: Db,
  id: string,
): Promise<A2ASessionDocument | null> {
  return collection(db).findOne({ _id: id });
}

export async function updateSession(
  db: Db,
  id: string,
  patch: Partial<A2ASessionDocument>,
): Promise<A2ASessionDocument | null> {
  const { _id: _ignored, ...rest } = patch;
  void _ignored;
  const result = await collection(db).findOneAndUpdate(
    { _id: id },
    { $set: rest },
    { returnDocument: "after" },
  );
  return result ?? null;
}
