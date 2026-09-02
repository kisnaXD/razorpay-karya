import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn, type ChildProcess } from "child_process";

async function main() {
  console.log("[karya] Starting in-memory MongoDB...");
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27017, dbName: "karya" },
  });
  const uri = mongod.getUri();
  console.log(`[karya] MongoDB ready at ${uri}`);

  const env = {
    ...process.env,
    MONGO_URL: uri,
    API_PORT: "4000",
    WEB_ORIGIN: "http://localhost:3055",
    ORG_ID: "org_arka",
    NODE_ENV: "development",
    A2A_ORG_ID: "org_arka",
    PAYOUT_PROVIDER: "ledger",
    BROWSER_ENABLED: "false",
    LLM_COPY_ENABLED: "false",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    NEXT_PUBLIC_API_URL: "http://localhost:4000",
  };

  console.log("[karya] Starting API on :4000...");
  const api = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: "apps/api",
    env,
    stdio: "inherit",
    shell: true,
  });

  await new Promise((r) => setTimeout(r, 3000));

  console.log("[karya] Starting Web on :3055...");
  const web = spawn("npx", ["next", "dev", "--port", "3055"], {
    cwd: "apps/web",
    env,
    stdio: "inherit",
    shell: true,
  });

  const cleanup = async () => {
    console.log("\n[karya] Shutting down...");
    web.kill();
    api.kill();
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
