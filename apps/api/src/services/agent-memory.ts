import type { Db } from "mongodb";
import { ulid } from "ulid";

export type MemoryKind = "preference" | "decision" | "override";

export type AgentMemory = {
  _id: string;
  orgId: string;
  kind: MemoryKind;
  subject: string;
  content: string;
  source: {
    type: "user" | "approval" | "agent";
    actor: string;
    refId?: string;
  };
  tags: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  useCount: number;
};

function collection(db: Db) {
  return db.collection<AgentMemory>("agent_memories");
}

export async function ensureMemoryIndexes(db: Db): Promise<void> {
  const col = collection(db);
  await col.createIndex({ orgId: 1, tags: 1 });
  await col.createIndex({ orgId: 1, subject: 1 });
  await col.createIndex({ orgId: 1, createdAt: -1 });
}

export async function recordMemory(
  db: Db,
  orgId: string,
  input: {
    kind: MemoryKind;
    subject: string;
    content: string;
    source: {
      type: "user" | "approval" | "agent";
      actor: string;
      refId?: string;
    };
    tags: string[];
  },
): Promise<AgentMemory> {
  const memory: AgentMemory = {
    _id: `mem_${ulid()}`,
    orgId,
    kind: input.kind,
    subject: input.subject,
    content: input.content,
    source: input.source,
    tags: input.tags,
    createdAt: new Date(),
    lastUsedAt: null,
    useCount: 0,
  };
  await collection(db).insertOne(memory);
  return memory;
}

export async function searchMemories(
  db: Db,
  orgId: string,
  query: {
    tags?: string[];
    subject?: string;
    limit?: number;
  },
): Promise<AgentMemory[]> {
  const filter: Record<string, unknown> = { orgId };
  if (query.tags?.length) filter.tags = { $in: query.tags };
  if (query.subject) {
    filter.subject = { $regex: query.subject, $options: "i" };
  }
  return collection(db)
    .find(filter)
    .sort({ useCount: -1, createdAt: -1 })
    .limit(query.limit ?? 10)
    .toArray();
}

export async function memoriesForContext(
  db: Db,
  orgId: string,
  context: {
    nodeKey?: string;
    action?: string;
    tags?: string[];
  },
): Promise<AgentMemory[]> {
  const filter: Record<string, unknown> = { orgId };
  const conditions: Record<string, unknown>[] = [];

  if (context.nodeKey) {
    conditions.push({
      subject: { $regex: context.nodeKey, $options: "i" },
    });
    const type = context.nodeKey.split(":")[0]?.toLowerCase();
    if (type) conditions.push({ tags: type });
  }
  if (context.action) {
    conditions.push({ subject: context.action });
    conditions.push({ tags: context.action.split(".")[0] });
  }
  if (context.tags?.length) {
    conditions.push({ tags: { $in: context.tags } });
  }

  if (conditions.length) filter.$or = conditions;

  const memories = await collection(db)
    .find(filter)
    .sort({ useCount: -1, createdAt: -1 })
    .limit(5)
    .toArray();

  if (memories.length) {
    const ids = memories.map((m) => m._id);
    await collection(db).updateMany(
      { _id: { $in: ids } },
      { $set: { lastUsedAt: new Date() }, $inc: { useCount: 1 } },
    );
  }

  return memories;
}

export async function recordOverride(
  db: Db,
  orgId: string,
  approval: {
    _id: string;
    proposedAction: { action: string; targetNodeKey?: string };
  },
  note: string,
): Promise<AgentMemory> {
  const action = approval.proposedAction.action;
  const target = approval.proposedAction.targetNodeKey || action;
  return recordMemory(db, orgId, {
    kind: "override",
    subject: target,
    content: `Rejected ${action} for ${target}: ${note}`,
    source: { type: "approval", actor: "operator", refId: approval._id },
    tags: [action.split(".")[0] || "general", "override"],
  });
}

export async function listMemories(
  db: Db,
  orgId: string,
  limit = 20,
): Promise<AgentMemory[]> {
  return collection(db)
    .find({ orgId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}
