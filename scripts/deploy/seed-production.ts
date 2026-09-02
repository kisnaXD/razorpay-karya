/**
 * One-time production seed against MongoDB Atlas.
 *
 * Usage (from repo root, with Atlas MONGO_URL):
 *   pnpm exec tsx scripts/deploy/seed-production.ts
 *
 * Idempotent — safe to re-run (seedArkaAtelier upserts by key).
 * Do not expose POST /v1/admin/seed in production; use this script instead.
 */
import { MongoClient } from "mongodb";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";

async function main(): Promise<void> {
  const url = process.env.MONGO_URL;
  if (!url) {
    throw new Error("MONGO_URL is required (Atlas connection string)");
  }

  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db();
    const store = new GraphStore(db);
    await store.ensureIndexes();
    const result = await seedArkaAtelier(store, db);
    console.log(
      JSON.stringify(
        {
          ok: true,
          orgId: result.orgId,
          nodes: result.nodes,
          edges: result.edges,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
