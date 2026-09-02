import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  console.log("[karya] Starting in-memory MongoDB...");
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017, dbName: "karya" },
  });
  console.log(`[karya] MongoDB ready at ${mongod.getUri()}`);
  console.log("[karya] Press Ctrl+C to stop");

  const cleanup = async () => {
    console.log("\n[karya] Stopping MongoDB...");
    await mongod.stop();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
