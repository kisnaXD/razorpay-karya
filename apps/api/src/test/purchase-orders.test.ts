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
import { GraphStore } from "@karya/graph";
import { ensureApprovalIndexes } from "../mongo.js";
import { buildApp } from "../app.js";
import type { Env } from "../env.js";
import type { FastifyInstance } from "fastify";
import {
  commitPurchaseOrder,
  draftPurchaseOrder,
} from "../services/purchase-orders.js";
import { resolveApproval } from "../services/approvals.js";

const ORG = "org_arka";

const testEnv: Env = {
  MONGO_URL: "mongodb://unused",
  API_PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "development",
  PAYOUT_PROVIDER: "ledger",
  A2A_ORG_ID: "org_arka",
  OPENAI_MODEL: "gpt-4o-mini",
  BROWSER_ENABLED: false,
};

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;
let app: FastifyInstance;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_purchase_orders_test");
});

afterAll(async () => {
  await app?.close();
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();
  await ensureApprovalIndexes(db);
  app = await buildApp({ store, db, env: testEnv, logger: false });
  await app.inject({
    method: "POST",
    url: "/v1/admin/seed",
    headers: { "x-org-id": ORG },
  });
});

describe("draftPurchaseOrder / commitPurchaseOrder", () => {
  it("draft creates pending approval; commit writes PO + Shipment", async () => {
    const { approvalId, preview } = await draftPurchaseOrder(db, store, {
      orgId: ORG,
      vendorOrgKey: "Org:Shree-Metal-Works",
      materialKey: "Material:BrassSheet-22g",
      qtyKg: 40,
      reasonSalesOrderKeys: ["SalesOrder:SO-218"],
      expectedAtDays: 7,
      explanation: "Draft 40kg brass sheet PO for SO-218",
    });

    expect(preview.poKey).toBe("PurchaseOrder:PO-105");
    expect(approvalId.startsWith("appr_")).toBe(true);

    const approvals = await db.collection("approvals").find({ orgId: ORG }).toArray();
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.status).toBe("pending");
    expect(approvals[0]!.proposedAction.action).toBe("po.create");
    expect(approvals[0]!.why).toMatch(/SO-218/);
    expect(approvals[0]!.proposedAction.explanation).toMatch(/SO-218/);
    expect(approvals[0]!.proposedAction.metadata?.why).toMatch(/SO-218|PO-104/);

    await resolveApproval(db, store, ORG, approvalId, {
      status: "approved",
      resolvedBy: "human:anika@arka.atelier",
    });

    const po = await store.getNodeByKey(ORG, "PurchaseOrder:PO-105");
    expect(po).not.toBeNull();
    expect(po!.props.status).toBe("open");
    expect(po!.props.qty).toBe(40);

    const ship = await store.getNodeByKey(ORG, "Shipment:IN-78");
    expect(ship).not.toBeNull();
    expect(ship!.props.direction).toBe("inbound");
    expect(ship!.props.status).toBe("expected");

    const edges = await store.listEdges(ORG);
    const contains = edges.find(
      (e) =>
        e.type === "ORDER_CONTAINS" &&
        e.fromId === po!._id &&
        e.validTo === null,
    );
    expect(contains).toBeTruthy();
    expect(contains!.props.qty).toBe(40);

    const fulfils = edges.find(
      (e) =>
        e.type === "FULFILLS" &&
        e.fromId === ship!._id &&
        e.toId === po!._id,
    );
    expect(fulfils).toBeTruthy();

    const events = await store.listNodes(ORG, "Event");
    expect(events.some((e) => e.props.event_type === "po.created")).toBe(true);
  });

  it("commitPurchaseOrder by approvalId writes the same graph", async () => {
    const { approvalId } = await draftPurchaseOrder(db, store, {
      orgId: ORG,
      vendorOrgKey: "Org:Shree-Metal-Works",
      materialKey: "Material:BrassSheet-22g",
      qtyKg: 40,
      explanation: "Commit path for brass PO-105",
    });

    // Mark approved without execute hook, then commit explicitly
    await db.collection("approvals").updateOne(
      { _id: approvalId },
      {
        $set: {
          status: "approved",
          resolvedBy: "human:anika@arka.atelier",
          resolvedAt: new Date(),
        },
      },
    );

    const result = await commitPurchaseOrder(
      db,
      store,
      ORG,
      approvalId,
      "human:anika@arka.atelier",
    );
    expect(result.poKey).toBe("PurchaseOrder:PO-105");
    expect(result.shipmentKey).toBe("Shipment:IN-78");
  });

  it("second pending draft reserves PO-106 instead of duplicating PO-105", async () => {
    const first = await draftPurchaseOrder(db, store, {
      orgId: ORG,
      vendorOrgKey: "Org:Shree-Metal-Works",
      materialKey: "Material:BrassSheet-22g",
      qtyKg: 40,
      explanation: "First brass draft",
    });
    expect(first.preview.poKey).toBe("PurchaseOrder:PO-105");

    const second = await draftPurchaseOrder(db, store, {
      orgId: ORG,
      vendorOrgKey: "Org:Meenakshi-Brass",
      materialKey: "Material:BrassSheet-22g",
      qtyKg: 20,
      explanation: "Second brass draft while first still pending",
    });
    expect(second.preview.poKey).toBe("PurchaseOrder:PO-106");
    expect(second.approvalId).not.toBe(first.approvalId);
  });
});
