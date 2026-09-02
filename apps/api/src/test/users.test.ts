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
  createUser,
  ensureUserIndexes,
  getRolePermissions,
  getRoles,
  getUser,
  listUsers,
  updateUser,
} from "../services/users.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_users_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  await ensureUserIndexes(db);
});

describe("users service", () => {
  it("creates, lists, updates, and filters users", async () => {
    const created = await createUser(db, ORG, {
      email: "priya@arkaatelier.in",
      name: "Priya Sharma",
      roleIds: ["sales"],
    });
    expect(created.status).toBe("invited");
    expect(created._id.startsWith("usr_")).toBe(true);

    await createUser(db, ORG, {
      email: "meenakshi@arkaatelier.in",
      name: "Meenakshi Devi",
      roleIds: ["admin"],
      status: "active",
    });

    const all = await listUsers(db, ORG);
    expect(all).toHaveLength(2);

    const sales = await listUsers(db, ORG, { role: "sales" });
    expect(sales).toHaveLength(1);
    expect(sales[0]!.email).toBe("priya@arkaatelier.in");

    const updated = await updateUser(db, ORG, created._id, {
      status: "active",
    });
    expect(updated.status).toBe("active");

    const fetched = await getUser(db, ORG, created._id);
    expect(fetched?.status).toBe("active");
  });

  it("exposes six roles and merges permissions", () => {
    const roles = getRoles();
    expect(roles).toHaveLength(6);
    expect(roles.map((r) => r.id)).toEqual([
      "admin",
      "accountant",
      "storekeeper",
      "shop_supervisor",
      "sales",
      "viewer",
    ]);

    const merged = getRolePermissions(["sales", "viewer"]);
    const sales = merged.find((p) => p.module === "sales");
    expect(sales?.actions).toEqual(expect.arrayContaining(["read", "write"]));
    const settings = merged.find((p) => p.module === "settings");
    expect(settings?.actions).toEqual(["read"]);
  });
});
