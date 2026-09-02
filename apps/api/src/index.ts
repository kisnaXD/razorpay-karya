import { loadEnv } from "./env.js";
import { connectMongo } from "./mongo.js";
import { buildApp } from "./app.js";
import { startAgentScheduler } from "./services/agent-scheduler.js";

async function main() {
  const env = loadEnv();
  const { client, db, store } = await connectMongo(env.MONGO_URL);
  const app = await buildApp({ store, db, env });

  const shutdown = async () => {
    await app.close();
    await client.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

  if (process.env.AGENT_EVENTS_ENABLED !== "false") {
    startAgentScheduler(app);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
