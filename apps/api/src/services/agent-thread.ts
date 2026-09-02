import type { Db } from "mongodb";
import type { AgentId, AgentThread, ThreadEntry } from "@karya/agents";

function collection(db: Db) {
  return db.collection<AgentThread>("agent_threads");
}

function threadId(orgId: string): string {
  return `thread_${orgId}`;
}

export async function ensureAgentThreadIndexes(db: Db): Promise<void> {
  await collection(db).createIndex({ orgId: 1 }, { unique: true });
}

export async function getOrCreateThread(
  db: Db,
  orgId: string,
): Promise<AgentThread> {
  const existing = await collection(db).findOne({ orgId });
  if (existing) return existing;

  const thread: AgentThread = {
    _id: threadId(orgId),
    orgId,
    entries: [],
    pending: null,
    updatedAt: new Date(),
  };
  try {
    await collection(db).insertOne(thread);
    return thread;
  } catch {
    const again = await collection(db).findOne({ orgId });
    if (again) return again;
    throw new Error("Failed to create agent thread");
  }
}

export async function appendEntry(
  db: Db,
  orgId: string,
  entry: ThreadEntry,
): Promise<AgentThread> {
  await getOrCreateThread(db, orgId);
  const result = await collection(db).findOneAndUpdate(
    { orgId },
    {
      $push: { entries: entry },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Thread not found");
  return result;
}

export async function appendEntries(
  db: Db,
  orgId: string,
  entries: ThreadEntry[],
): Promise<AgentThread> {
  await getOrCreateThread(db, orgId);
  if (entries.length === 0) {
    return (await collection(db).findOne({ orgId }))!;
  }
  const result = await collection(db).findOneAndUpdate(
    { orgId },
    {
      $push: { entries: { $each: entries } },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Thread not found");
  return result;
}

export async function updateToolEntry(
  db: Db,
  orgId: string,
  entryId: string,
  patch: Partial<ThreadEntry>,
): Promise<AgentThread> {
  const thread = await getOrCreateThread(db, orgId);
  const entries = thread.entries.map((e) => {
    if (e.id !== entryId || e.kind !== "tool") return e;
    return { ...e, ...patch, kind: "tool" as const, id: e.id };
  });
  const result = await collection(db).findOneAndUpdate(
    { orgId },
    { $set: { entries, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Thread not found");
  return result;
}

export async function updateConsultEntry(
  db: Db,
  orgId: string,
  entryId: string,
  patch: Partial<Extract<ThreadEntry, { kind: "consult" }>>,
): Promise<AgentThread> {
  const thread = await getOrCreateThread(db, orgId);
  const entries = thread.entries.map((e) => {
    if (e.id !== entryId || e.kind !== "consult") return e;
    return { ...e, ...patch, kind: "consult" as const, id: e.id };
  });
  const result = await collection(db).findOneAndUpdate(
    { orgId },
    { $set: { entries, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Thread not found");
  return result;
}

export async function setActiveAgentId(
  db: Db,
  orgId: string,
  activeAgentId: AgentId,
): Promise<AgentThread> {
  const result = await collection(db).findOneAndUpdate(
    { orgId },
    { $set: { activeAgentId, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Thread not found");
  return result;
}

export async function setPending(
  db: Db,
  orgId: string,
  pending: AgentThread["pending"],
): Promise<AgentThread> {
  const result = await collection(db).findOneAndUpdate(
    { orgId },
    { $set: { pending, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Thread not found");
  return result;
}

export async function clearPending(
  db: Db,
  orgId: string,
): Promise<AgentThread> {
  return setPending(db, orgId, null);
}

export async function replaceThreadEntries(
  db: Db,
  orgId: string,
  entries: ThreadEntry[],
  pending: AgentThread["pending"],
): Promise<AgentThread> {
  await getOrCreateThread(db, orgId);
  const result = await collection(db).findOneAndUpdate(
    { orgId },
    { $set: { entries, pending, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Thread not found");
  return result;
}
