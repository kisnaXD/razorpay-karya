import type { FastifyPluginAsync } from "fastify";
import type { Db } from "mongodb";
import { z } from "zod";
import type { GraphStore } from "@karya/graph";
import { RazorpayClient } from "@karya/razorpay";
import {
  buildCatalog,
  type CreateCheckoutSessionRequest,
} from "@karya/a2a";
import type { Env } from "../env.js";
import { razorpayConfigured } from "../env.js";
import { writeAuditEvent } from "../services/audit.js";
import {
  A2ACheckoutError,
  completeCheckoutSession,
  createCheckoutSession,
  getA2AOrder,
  type A2ACheckoutDeps,
} from "../services/a2a-checkout.js";

type PluginOpts = {
  env: Env;
  store: GraphStore;
  db: Db;
};

const createSessionBody = z.object({
  lineItems: z
    .array(
      z.object({
        skuKey: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  buyer: z
    .object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      agentId: z.string().optional(),
    })
    .optional(),
  fulfillment: z
    .object({
      type: z.literal("ship"),
      preferredBy: z.string().optional(),
    })
    .optional(),
});

const completeBody = z
  .object({
    idempotencyKey: z.string().optional(),
  })
  .optional();

function depsFrom(
  opts: PluginOpts,
): A2ACheckoutDeps {
  const deps: A2ACheckoutDeps = {
    store: opts.store,
    db: opts.db,
    env: opts.env,
    audit: writeAuditEvent,
  };
  if (razorpayConfigured(opts.env)) {
    deps.razorpayClient = new RazorpayClient({
      keyId: opts.env.RAZORPAY_KEY_ID!,
      keySecret: opts.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return deps;
}

function sendError(
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  err: unknown,
) {
  if (err instanceof A2ACheckoutError) {
    const body: { error: string; detail?: string; skuKey?: string } = {
      error: err.code,
    };
    if (err.detail) body.detail = err.detail;
    if (err.skuKey) body.skuKey = err.skuKey;
    return reply.code(err.statusCode).send(body);
  }
  throw err;
}

export const a2aRoutes: FastifyPluginAsync<PluginOpts> = async (app, opts) => {
  const orgId = opts.env.A2A_ORG_ID;
  const deps = depsFrom(opts);

  app.get("/a2a/catalog", async () => {
    return buildCatalog(opts.store, orgId);
  });

  app.post("/a2a/checkout/sessions", async (request, reply) => {
    const parsed = createSessionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        detail: parsed.error.message,
      });
    }
    try {
      const input: CreateCheckoutSessionRequest = {
        lineItems: parsed.data.lineItems,
      };
      if (parsed.data.buyer) {
        const buyer: NonNullable<CreateCheckoutSessionRequest["buyer"]> = {};
        if (parsed.data.buyer.name !== undefined) {
          buyer.name = parsed.data.buyer.name;
        }
        if (parsed.data.buyer.email !== undefined) {
          buyer.email = parsed.data.buyer.email;
        }
        if (parsed.data.buyer.agentId !== undefined) {
          buyer.agentId = parsed.data.buyer.agentId;
        }
        input.buyer = buyer;
      }
      if (parsed.data.fulfillment) {
        const fulfillment: NonNullable<
          CreateCheckoutSessionRequest["fulfillment"]
        > = { type: "ship" };
        if (parsed.data.fulfillment.preferredBy !== undefined) {
          fulfillment.preferredBy = parsed.data.fulfillment.preferredBy;
        }
        input.fulfillment = fulfillment;
      }
      const session = await createCheckoutSession(deps, orgId, input);
      return { session };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/a2a/checkout/sessions/:id/complete", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = completeBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        detail: parsed.error.message,
      });
    }
    try {
      const completeInput =
        parsed.data?.idempotencyKey !== undefined
          ? { idempotencyKey: parsed.data.idempotencyKey }
          : undefined;
      return await completeCheckoutSession(deps, orgId, id, completeInput);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/a2a/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await getA2AOrder(deps, orgId, id);
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
