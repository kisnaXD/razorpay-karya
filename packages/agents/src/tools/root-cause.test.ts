import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";
import {
  rootCauseAnalysis,
  type RootCauseResult,
} from "./root-cause.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_root_cause_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();
  await seedArkaAtelier(store, db);
});

function assertValidResult(result: RootCauseResult, question: string) {
  expect(result.question).toBe(question);
  expect(Array.isArray(result.steps)).toBe(true);
  expect(typeof result.summary).toBe("string");
  expect(result.summary.length).toBeGreaterThan(0);
  expect(Array.isArray(result.recommendedActions)).toBe(true);
  for (const step of result.steps) {
    expect(["finance", "procurement", "inventory", "sales"]).toContain(
      step.layer,
    );
    expect(step.nodeKey.length).toBeGreaterThan(0);
    expect(step.label.length).toBeGreaterThan(0);
    expect(step.finding.length).toBeGreaterThan(0);
  }
  for (const action of result.recommendedActions) {
    expect(action.label.length).toBeGreaterThan(0);
    expect(action.toolHint.length).toBeGreaterThan(0);
    expect(action.nodeKey.length).toBeGreaterThan(0);
  }
}

describe("rootCauseAnalysis", () => {
  it("margin analysis walks SKU → material → late PO on seeded Arka data", async () => {
    const question = "Why is margin falling on Diya?";
    const result = await rootCauseAnalysis(store, ORG, {
      question,
      focusNodeKey: "SKU:Diya-Large",
    });
    assertValidResult(result, question);
    expect(result.steps.length).toBeGreaterThan(0);
    const keys = result.steps.map((s) => s.nodeKey);
    expect(keys).toContain("SKU:Diya-Large");
    expect(keys).toContain("Material:BrassSheet-22g");
    expect(
      result.steps.some(
        (s) =>
          s.nodeKey === "PurchaseOrder:PO-104" ||
          s.finding.toLowerCase().includes("late"),
      ),
    ).toBe(true);
    expect(result.summary.toLowerCase()).toMatch(/margin|late|po/);
  });

  it("cash/receivables analysis finds overdue INV-90", async () => {
    const question = "Where is our cash tied up in receivables?";
    const result = await rootCauseAnalysis(store, ORG, { question });
    assertValidResult(result, question);
    const keys = result.steps.map((s) => s.nodeKey);
    expect(keys).toContain("Invoice:INV-90");
    expect(result.summary).toMatch(/₹/);
    expect(
      result.recommendedActions.some(
        (a) =>
          a.toolHint === "money_propose_collection" ||
          a.toolHint === "money_run_collections_loop",
      ),
    ).toBe(true);
  });

  it("delay analysis on SO-218 finds late brass PO", async () => {
    const question = "Why is this order late?";
    const result = await rootCauseAnalysis(store, ORG, {
      question,
      focusNodeKey: "SalesOrder:SO-218",
    });
    assertValidResult(result, question);
    const keys = result.steps.map((s) => s.nodeKey);
    expect(keys).toContain("PurchaseOrder:PO-104");
    expect(
      keys.some((k) => k === "SalesOrder:SO-218" || k === "Material:BrassSheet-22g"),
    ).toBe(true);
  });

  it("unknown keywords return a helpful no-template result", async () => {
    const question = "Tell me a joke about brass";
    const result = await rootCauseAnalysis(store, ORG, { question });
    assertValidResult(result, question);
    expect(result.steps).toEqual([]);
    expect(result.summary.toLowerCase()).toContain(
      "no matching analysis template",
    );
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });
});
