import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AGENT_DEFINITIONS,
  listConsultableAgents,
} from "@karya/agents";
import {
  AgentApprovalStillPendingError,
  AgentResumeMismatchError,
  LlmNotConfiguredError,
  handleAgentMessage,
  resumeAfterApproval,
  type AgentStreamEvent,
} from "../services/agent-runner.js";
import { getOrCreateThread } from "../services/agent-thread.js";
import type { Env } from "../env.js";

type PluginOpts = { env: Env };

const attachmentSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  data: z.string().min(1),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});

const messageBodySchema = z
  .object({
    message: z.string(),
    contextNodeKey: z.string().optional(),
    agentId: z
      .enum(["governor", "finance", "procurement", "sales", "operations"])
      .optional(),
    attachments: z.array(attachmentSchema).optional(),
  })
  .refine(
    (body) =>
      body.message.trim().length > 0 ||
      (body.attachments !== undefined && body.attachments.length > 0),
    { message: "message_or_attachments_required" },
  );

const resumeBodySchema = z.object({
  approvalId: z.string().min(1),
});

function actorFrom(headers: Record<string, unknown>): string {
  const actor = headers["x-actor"];
  return typeof actor === "string" && actor.length > 0
    ? actor
    : "human:anika@arka.atelier";
}

function writeSse(reply: {
  raw: NodeJS.WritableStream;
}, event: AgentStreamEvent) {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export const agentRoutes: FastifyPluginAsync<PluginOpts> = async (
  app,
  opts,
) => {
  app.get("/v1/agent/thread", async (request) => {
    const thread = await getOrCreateThread(app.db, request.orgId);
    return { thread };
  });

  app.get("/v1/agent/personas", async () => {
    return {
      personas: [
        AGENT_DEFINITIONS.governor,
        ...listConsultableAgents(),
      ],
    };
  });

  app.post<{ Body: z.infer<typeof messageBodySchema> }>(
    "/v1/agent/message",
    async (request, reply) => {
      if (!opts.env.OPENAI_API_KEY) {
        return reply.code(503).send({ error: "llm_not_configured" });
      }

      const parsed = messageBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      const origin = (request.headers.origin as string) ?? "";
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      });

      try {
        await handleAgentMessage(
          app.db,
          app.store,
          opts.env,
          request.orgId,
          {
            message: parsed.data.message,
            ...(parsed.data.contextNodeKey !== undefined
              ? { contextNodeKey: parsed.data.contextNodeKey }
              : {}),
            ...(parsed.data.agentId !== undefined
              ? { agentId: parsed.data.agentId }
              : {}),
            ...(parsed.data.attachments !== undefined
              ? { attachments: parsed.data.attachments }
              : {}),
            actor: actorFrom(request.headers as Record<string, unknown>),
          },
          (event) => writeSse(reply, event),
        );
      } catch (err) {
        const message =
          err instanceof LlmNotConfiguredError
            ? "llm_not_configured"
            : err instanceof Error
              ? err.message
              : "agent_error";
        writeSse(reply, { type: "error", message });
      } finally {
        reply.raw.end();
      }
    },
  );

  app.post<{ Body: z.infer<typeof resumeBodySchema> }>(
    "/v1/agent/resume",
    async (request, reply) => {
      const parsed = resumeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      try {
        const result = await resumeAfterApproval(
          app.db,
          app.store,
          opts.env,
          request.orgId,
          parsed.data.approvalId,
        );
        return result;
      } catch (err) {
        if (err instanceof AgentResumeMismatchError) {
          return reply.code(404).send({ error: "resume_mismatch" });
        }
        if (err instanceof AgentApprovalStillPendingError) {
          return reply.code(409).send({ error: "approval_pending" });
        }
        throw err;
      }
    },
  );
};
