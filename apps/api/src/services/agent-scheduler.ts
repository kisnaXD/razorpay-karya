import type { FastifyInstance } from "fastify";
import { scanForEvents } from "./agent-events.js";

const SCAN_INTERVAL_MS = 60_000;
/** Demo org — matches seed + web x-org-id header. */
const ORG_ID = "org_arka";

export function startAgentScheduler(app: FastifyInstance): void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const events = await scanForEvents(app.db, app.store, ORG_ID);
      if (events.length > 0) {
        app.log.info(
          { count: events.length },
          "Agent scanner found new events",
        );
      }
    } catch (err) {
      app.log.error({ err }, "Agent scanner error");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, SCAN_INTERVAL_MS);

  const cleanup = () => clearInterval(timer);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
}
