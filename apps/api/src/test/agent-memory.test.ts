import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  ensureMemoryIndexes,
  listMemories,
  memoriesForContext,
  recordMemory,
  recordOverride,
  searchMemories,
} from "../services/agent-memory.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_agent_memory_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  await ensureMemoryIndexes(db);
});

describe("agent-memory", () => {
  it("recordMemory creates a memory", async () => {
    const memory = await recordMemory(db, ORG, {
      kind: "preference",
      subject: "Material:BrassSheet-22g",
      content: "Prefer Shree Metal Works for brass",
      source: { type: "user", actor: "human:anika" },
      tags: ["procurement", "vendor"],
    });
    expect(memory._id.startsWith("mem_")).toBe(true);
    expect(memory.kind).toBe("preference");
    expect(memory.useCount).toBe(0);
    expect(memory.lastUsedAt).toBeNull();

    const stored = await db
      .collection<{ _id: string; content: string }>("agent_memories")
      .findOne({ _id: memory._id });
    expect(stored?.content).toBe("Prefer Shree Metal Works for brass");
  });

  it("searchMemories finds by tags", async () => {
    await recordMemory(db, ORG, {
      kind: "preference",
      subject: "Material:BrassSheet-22g",
      content: "Brass vendor preference",
      source: { type: "agent", actor: "agent:governor" },
      tags: ["procurement", "brass"],
    });
    await recordMemory(db, ORG, {
      kind: "decision",
      subject: "Org:Rangoli-Retail",
      content: "Email collections work",
      source: { type: "approval", actor: "operator" },
      tags: ["finance", "collections"],
    });

    const hits = await searchMemories(db, ORG, { tags: ["procurement"] });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.subject).toBe("Material:BrassSheet-22g");
  });

  it("searchMemories finds by subject", async () => {
    await recordMemory(db, ORG, {
      kind: "preference",
      subject: "Material:BrassSheet-22g",
      content: "Brass preference",
      source: { type: "user", actor: "human:anika" },
      tags: ["material"],
    });
    await recordMemory(db, ORG, {
      kind: "preference",
      subject: "Material:JuteCord-2mm",
      content: "Jute preference",
      source: { type: "user", actor: "human:anika" },
      tags: ["material"],
    });

    const hits = await searchMemories(db, ORG, { subject: "brass" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.subject).toBe("Material:BrassSheet-22g");
  });

  it("memoriesForContext returns relevant memories and bumps useCount", async () => {
    await recordMemory(db, ORG, {
      kind: "preference",
      subject: "Material:BrassSheet-22g",
      content: "Prefer Shree for brass",
      source: { type: "user", actor: "human:anika" },
      tags: ["procurement", "material"],
    });
    await recordMemory(db, ORG, {
      kind: "decision",
      subject: "po.create",
      content: "Always approve small brass POs",
      source: { type: "approval", actor: "operator" },
      tags: ["procurement", "decision"],
    });

    const hits = await memoriesForContext(db, ORG, {
      nodeKey: "Material:BrassSheet-22g",
    });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some((m) => m.subject.includes("BrassSheet"))).toBe(true);

    const refreshed = await db
      .collection<{ _id: string; useCount: number; lastUsedAt: Date | null }>(
        "agent_memories",
      )
      .findOne({ _id: hits[0]!._id });
    expect(refreshed?.useCount).toBe(1);
    expect(refreshed?.lastUsedAt).toBeTruthy();
  });

  it("recordOverride on approval rejection creates override memory", async () => {
    const memory = await recordOverride(
      db,
      ORG,
      {
        _id: "appr_test1",
        proposedAction: {
          action: "po.create",
          targetNodeKey: "Org:Jaipur-Alloys",
        },
      },
      "Need CFO sign-off for large POs",
    );
    expect(memory.kind).toBe("override");
    expect(memory.subject).toBe("Org:Jaipur-Alloys");
    expect(memory.content).toContain("Rejected po.create");
    expect(memory.content).toContain("Need CFO sign-off");
    expect(memory.source.refId).toBe("appr_test1");
    expect(memory.tags).toContain("override");
  });

  it("listMemories returns memories sorted by date", async () => {
    const first = await recordMemory(db, ORG, {
      kind: "preference",
      subject: "a",
      content: "Older memory",
      source: { type: "user", actor: "human:anika" },
      tags: ["general"],
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await recordMemory(db, ORG, {
      kind: "decision",
      subject: "b",
      content: "Newer memory",
      source: { type: "user", actor: "human:anika" },
      tags: ["general"],
    });

    const listed = await listMemories(db, ORG, 10);
    expect(listed).toHaveLength(2);
    expect(listed[0]?._id).toBe(second._id);
    expect(listed[1]?._id).toBe(first._id);
  });
});
