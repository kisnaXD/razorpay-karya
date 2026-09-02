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
  db = client.db("karya_listings_test");
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

describe("listings routes", () => {
  it("drafts listing copy onto Listing:Diya-Large-Instagram", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/listings/draft",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: { skuKey: "SKU:Diya-Large", channel: "instagram" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      listingKey: string;
      draft: { title: string; bullets: string[] };
    };
    expect(body.listingKey).toBe("Listing:Diya-Large-Instagram");
    expect(body.draft.title.toLowerCase()).toContain("brass");
    expect(body.draft.bullets.join(" ")).toContain("Diya-Large");

    const listing = await store.getNodeByKey(
      ORG,
      "Listing:Diya-Large-Instagram",
    );
    expect(listing?.props.draft_title).toBeTruthy();
    expect(typeof listing?.props.draft_bullets).toBe("string");
  });

  it("publish creates approval; approve sets published + Event", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/listings/draft",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: { skuKey: "SKU:Diya-Large", channel: "instagram" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/listings/publish",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: { listingKey: "Listing:Diya-Large-Instagram" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { approval: { _id: string } };
    expect(body.approval._id).toBeTruthy();

    await resolveApproval(db, store, ORG, body.approval._id, {
      status: "approved",
      resolvedBy: "human:anika@arka.atelier",
    });

    const listing = await store.getNodeByKey(
      ORG,
      "Listing:Diya-Large-Instagram",
    );
    expect(listing?.props.status).toBe("published");

    const events = await store.listNodes(ORG, "Event");
    expect(
      events.some((e) => e.props.event_type === "listing.published"),
    ).toBe(true);
  });
});
