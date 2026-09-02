import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { parseCompiledPolicy } from "@karya/policy";
import { seedArkaAtelier } from "./arka.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_seed_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();
});

describe("seedArkaAtelier", () => {
  it("creates the beating-heart path from SO-218 to Meenakshi Brass", async () => {
    await seedArkaAtelier(store, db);
    const so = await store.getNodeByKey(ORG, "SalesOrder:SO-218");
    const vendor = await store.getNodeByKey(ORG, "Org:Meenakshi-Brass");
    const p = await store.path(ORG, so!._id, vendor!._id);
    expect(p).not.toBeNull();
  });

  it("depth-2 neighborhood from SO-218 reaches Meenakshi, PO-104, and IN-77", async () => {
    await seedArkaAtelier(store, db);
    const so = await store.getNodeByKey(ORG, "SalesOrder:SO-218");
    const n = await store.neighborhood(ORG, so!._id, 2);
    const keys = n.nodes.map((x) => x.key);
    expect(keys).toContain("Org:Meenakshi-Brass");
    expect(keys).toContain("PurchaseOrder:PO-104");
    expect(keys).toContain("Shipment:IN-77");
  });

  it("exceptions include INV-90, IN-77, PO-104, plink_7, and SO-218 promise risk", async () => {
    await seedArkaAtelier(store, db);
    const ex = await store.exceptions(ORG);
    const codes = ex.map((e) => e.code).sort();
    expect(codes).toEqual(
      expect.arrayContaining([
        "invoice.overdue",
        "shipment.delayed",
        "po.late",
        "payment.uncollected",
        "stock.promise_risk",
      ]),
    );
  });

  it("is idempotent", async () => {
    const a = await seedArkaAtelier(store, db);
    const b = await seedArkaAtelier(store, db);
    expect(b.nodes).toBe(a.nodes);
  });

  it("Policy nodes have parseable rules_json", async () => {
    await seedArkaAtelier(store, db);
    const p = await store.getNodeByKey(ORG, "Policy:pay.vendor");
    expect(() =>
      parseCompiledPolicy(String(p!.props.rules_json)),
    ).not.toThrow();
  });

  it("INV-90 carries collections props and plink_7 has razorpay id", async () => {
    await seedArkaAtelier(store, db);
    const inv = await store.getNodeByKey(ORG, "Invoice:INV-90");
    expect(inv!.props.nudge_count).toBe(1);
    expect(inv!.props.collections_state).toBe("link_sent");
    const pay = await store.getNodeByKey(ORG, "Payment:plink_7");
    expect(pay!.props.razorpay_payment_link_id).toBe("plink_7");
    const stock = await store.getNodeByKey(ORG, "Stock:Diya-Large@Workshop");
    expect(stock!.props.hold_until).toBeNull();
    expect(stock!.props.reserved).toBe(9);
  });

  it("seeds Policy:money.recovery", async () => {
    await seedArkaAtelier(store, db);
    const p = await store.getNodeByKey(ORG, "Policy:money.recovery");
    expect(p).not.toBeNull();
    expect(() =>
      parseCompiledPolicy(String(p!.props.rules_json)),
    ).not.toThrow();
  });

  it("seeds ≥3 brass vendors via SUPPLIES to Material:BrassSheet-22g", async () => {
    await seedArkaAtelier(store, db);
    const brass = await store.getNodeByKey(ORG, "Material:BrassSheet-22g");
    expect(brass).not.toBeNull();
    const edges = await store.listEdges(ORG);
    const suppliers = edges
      .filter(
        (e) =>
          e.type === "SUPPLIES" &&
          e.toId === brass!._id &&
          e.validTo === null,
      )
      .map((e) => e.fromId);
    expect(suppliers.length).toBeGreaterThanOrEqual(3);
    const shree = await store.getNodeByKey(ORG, "Org:Shree-Metal-Works");
    const jaipur = await store.getNodeByKey(ORG, "Org:Jaipur-Alloys");
    expect(shree).not.toBeNull();
    expect(jaipur).not.toBeNull();
  });

  it("seeds Policy:po.create", async () => {
    await seedArkaAtelier(store, db);
    const p = await store.getNodeByKey(ORG, "Policy:po.create");
    expect(p).not.toBeNull();
    expect(() =>
      parseCompiledPolicy(String(p!.props.rules_json)),
    ).not.toThrow();
  });

  it("Meeting:VendorCall-Thu starts on the nearest Thursday (current week)", async () => {
    await seedArkaAtelier(store, db);
    const meeting = await store.getNodeByKey(ORG, "Meeting:VendorCall-Thu");
    expect(meeting).not.toBeNull();
    const startsAt = String(meeting!.props.startsAt);
    const meetingDay = new Date(startsAt).getDay();
    expect(meetingDay).toBe(4); // Thursday

    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const t = new Date(startsAt).getTime();
    expect(t).toBeGreaterThanOrEqual(startOfWeek.getTime());
    expect(t).toBeLessThan(endOfWeek.getTime());
  });
});
