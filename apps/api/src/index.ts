import { loadEnv } from "./env.js";
import { connectMongo } from "./mongo.js";
import { buildApp } from "./app.js";

async function main() {
  const env = loadEnv();
  const { client, store } = await connectMongo(env.MONGO_URL);
  const app = await buildApp({ store, env });

  const shutdown = async () => {
    await app.close();
    await client.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
