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
import { buildApp } from "./app.js";
import type { Env } from "./env.js";
import type { FastifyInstance } from "fastify";

const ORG = "org_arka";

const testEnv: Env = {
  MONGO_URL: "mongodb://unused",
  API_PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "development",
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
  db = client.db("karya_api_test");
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
  app = await buildApp({ store, env: testEnv, logger: false });
});

function orgHeaders(extra: Record<string, string> = {}) {
  return { "x-org-id": ORG, ...extra };
}

describe("@karya/api", () => {
  it("GET /health returns ok without x-org-id", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("returns 400 when x-org-id is missing on protected routes", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/exceptions" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "x-org-id required" });
  });

  it("POST /v1/admin/seed then GET /v1/exceptions returns at least 4 exceptions", async () => {
    const seed = await app.inject({
      method: "POST",
      url: "/v1/admin/seed",
      headers: orgHeaders(),
    });
    expect(seed.statusCode).toBe(200);
    expect(seed.json()).toMatchObject({
      orgId: ORG,
      nodes: expect.any(Number),
      edges: expect.any(Number),
    });

    const ex = await app.inject({
      method: "GET",
      url: "/v1/exceptions",
      headers: orgHeaders(),
    });
    expect(ex.statusCode).toBe(200);
    const body = ex.json() as { exceptions: unknown[] };
    expect(body.exceptions.length).toBeGreaterThanOrEqual(4);
  });

  it("GET /v1/nodes/:key returns 404 for unknown key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/nodes/SKU%3AMissing",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /v1/path returns a multi-hop path after seed", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/admin/seed",
      headers: orgHeaders(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/path?from=SalesOrder%3ASO-218&to=Org%3AMeenakshi-Brass",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { nodes?: unknown[]; edges?: unknown[]; path?: null };
    expect(body.path).toBeUndefined();
    expect(body.nodes!.length).toBeGreaterThanOrEqual(2);
    expect(body.edges!.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /v1/bootstrap returns org, exceptionCount, and cashInPaise", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/admin/seed",
      headers: orgHeaders(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      org: { key: string };
      exceptionCount: number;
      cashInPaise: number;
    };
    expect(body.org.key).toBe("Org:Arka-Atelier");
    expect(body.exceptionCount).toBeGreaterThanOrEqual(4);
    expect(body.cashInPaise).toBe(42000000);
  });

  it("POST /v1/admin/seed is forbidden outside development", async () => {
    const prodApp = await buildApp({
      store,
      env: { ...testEnv, NODE_ENV: "production" },
      logger: false,
    });

    const res = await prodApp.inject({
      method: "POST",
      url: "/v1/admin/seed",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(403);
    await prodApp.close();
  });
});
