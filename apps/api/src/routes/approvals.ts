import type { FastifyPluginAsync } from "fastify";
import type { ProposedAction } from "@karya/policy";
import {
  ApprovalAlreadyResolvedError,
  ApprovalDeniedError,
  ApprovalNotFoundError,
  createApproval,
  getApproval,
  listApprovals,
  resolveApproval,
  type ApprovalStatus,
} from "../services/approvals.js";
import { buildPayoutAdapter, buildRazorpayClient } from "../services/payout.js";
import type { Env } from "../env.js";

type PluginOpts = { env: Env };

export const approvalsRoutes: FastifyPluginAsync<PluginOpts> = async (
  app,
  opts,
) => {
  app.post<{ Body: { proposedAction: ProposedAction } }>(
    "/v1/approvals",
    async (request, reply) => {
      const { proposedAction } = request.body ?? {};
      if (!proposedAction?.action || !proposedAction.explanation) {
        return reply
          .code(400)
          .send({ error: "proposedAction with action and explanation required" });
      }

      proposedAction.orgId = request.orgId;

      try {
        const result = await createApproval(
          app.db,
          app.store,
          request.orgId,
          proposedAction,
        );
        if ("autoAllowed" in result) {
          return { autoAllowed: true, evaluation: result.evaluation };
        }
        return { approval: result.approval };
      } catch (err) {
        if (err instanceof ApprovalDeniedError) {
          return reply
            .code(403)
            .send({ denied: true, evaluation: err.evaluation });
        }
        throw err;
      }
    },
  );

  app.get("/v1/approvals", async (request) => {
    const query = request.query as { status?: string };
    const status = query.status as ApprovalStatus | undefined;
    const approvals = await listApprovals(app.db, request.orgId, {
      ...(status ? { status } : {}),
    });
    return { approvals };
  });

  app.get<{ Params: { id: string } }>(
    "/v1/approvals/:id",
    async (request, reply) => {
      const approval = await getApproval(
        app.db,
        request.orgId,
        request.params.id,
      );
      if (!approval) {
        return reply.code(404).send({ error: "approval_not_found" });
      }
      return { approval };
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      status: "approved" | "rejected" | "edited";
      resolvedBy: string;
      note?: string;
    };
  }>("/v1/approvals/:id/resolve", async (request, reply) => {
    const { status, resolvedBy, note } = request.body ?? {};
    if (!status || !resolvedBy) {
      return reply
        .code(400)
        .send({ error: "status and resolvedBy required" });
    }

    try {
      const approval = await resolveApproval(
        app.db,
        app.store,
        request.orgId,
        request.params.id,
        { status, resolvedBy, ...(note ? { note } : {}) },
        {
          razorpayClient: buildRazorpayClient(opts.env),
          payoutAdapter: buildPayoutAdapter(opts.env),
          ...(opts.env.RESEND_API_KEY !== undefined
            ? { resendApiKey: opts.env.RESEND_API_KEY }
            : {}),
          ...(opts.env.RESEND_FROM !== undefined
            ? { resendFrom: opts.env.RESEND_FROM }
            : {}),
        },
      );
      return { approval };
    } catch (err) {
      if (err instanceof ApprovalNotFoundError) {
        return reply.code(404).send({ error: "approval_not_found" });
      }
      if (err instanceof ApprovalAlreadyResolvedError) {
        return reply.code(409).send({ error: "approval_already_resolved" });
      }
      throw err;
    }
  });
};
