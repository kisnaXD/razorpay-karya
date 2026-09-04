import type { Db } from "mongodb";
import { ulid } from "ulid";
import type { GraphStore } from "@karya/graph";
import {
  AGENT_DEFINITIONS,
  buildTools,
  buildToolsForAgent,
  consultAgentsParallel,
  moneyCreatePaymentLink,
  runGovernorResume,
  runGovernorTurn,
  runSpecialistTurn,
  type AgentId,
  type AgentThread,
  type ThreadEntry,
  type ToolContext,
} from "@karya/agents";
import type { Env } from "../env.js";
import { writeAuditEvent } from "./audit.js";
import { createApproval, getApproval, listReservedPoKeys } from "./approvals.js";
import {
  memoriesForContext,
  recordMemory,
  searchMemories,
} from "./agent-memory.js";
import { evaluateAction } from "./policy.js";
import { createPaymentLinkForInvoice } from "./payment-links.js";
import { buildRazorpayClient } from "./payout.js";
import { runPromiseQuery } from "./inventory.js";
import {
  acceptSalesOrder,
  generateQuote,
  getOrderBook,
  rejectSalesOrder,
} from "./sales.js";
import {
  appendEntry,
  appendEntries,
  clearPending,
  getOrCreateThread,
  setActiveAgentId,
  setPending,
  updateConsultEntry,
  updateToolEntry,
} from "./agent-thread.js";

export type AgentStreamEvent =
  | { type: "thread"; thread: AgentThread }
  | { type: "text-delta"; delta: string }
  | { type: "done"; thread: AgentThread }
  | { type: "error"; message: string };

export type AgentAttachment = {
  name: string;
  type: string;
  data: string;
  size: number;
};

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function enrichMessageWithAttachments(
  message: string,
  attachments: AgentAttachment[] | undefined,
): string {
  if (!attachments?.length) return message;
  const list = attachments
    .map((a) => `${a.name} (${formatAttachmentSize(a.size)})`)
    .join(", ");
  const suffix = `[User attached: ${list}]`;
  const trimmed = message.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${suffix}` : suffix;
}

function buildToolContext(
  db: Db,
  store: GraphStore,
  env: Env,
  orgId: string,
  agentId: AgentId,
  options?: { skipPolicy?: boolean },
): ToolContext {
  const actor = `agent:${agentId}`;
  return {
    orgId,
    store,
    ...(options?.skipPolicy ? { skipPolicy: true } : {}),
    evaluateAction: (proposed) => evaluateAction(store, orgId, proposed),
    createApproval: (proposed) => createApproval(db, store, orgId, proposed),
    listReservedPoKeys: () => listReservedPoKeys(db, orgId),
    createPaymentLink: async ({ invoiceKey }) => {
      const client = buildRazorpayClient(env);
      if (!client) {
        throw new Error("razorpay_not_configured");
      }
      const result = await createPaymentLinkForInvoice(
        store,
        client,
        writeAuditEvent,
        { orgId, invoiceKey, actor },
      );
      return {
        paymentNode: { key: result.paymentNode.key },
        razorpay: { short_url: result.razorpay.short_url },
        created: result.created,
      };
    },
    writeAudit: (input) =>
      writeAuditEvent(store, {
        orgId,
        actor,
        eventType: input.eventType,
        sideEffectClass: input.sideEffectClass,
        payload: input.payload,
        ...(input.aboutNodeIds ? { aboutNodeIds: input.aboutNodeIds } : {}),
      }),
    promiseQuery: (input) => runPromiseQuery(store, orgId, input),
    getOrderBook: (filter) => getOrderBook(store, orgId, filter),
    generateQuote: (input) => generateQuote(store, orgId, input),
    acceptSalesOrder: async (input) => {
      const result = await acceptSalesOrder(
        store,
        orgId,
        writeAuditEvent,
        input,
      );
      return {
        salesOrder: {
          key: result.salesOrder.key,
          label: result.salesOrder.label,
        },
        promiseResult: result.promiseResult,
      };
    },
    rejectSalesOrder: async (input) => {
      const so = await rejectSalesOrder(store, orgId, writeAuditEvent, input);
      return {
        key: so.key,
        label: so.label,
        status: String(so.props.status ?? "cancelled"),
      };
    },
    runCollectionsLoop: async () => {
      const { runCollections } = await import("./collections.js");
      return runCollections(store, db, buildRazorpayClient(env), orgId);
    },
    handlePaymentFailure: async (paymentKey, webhookEvent) => {
      const { handlePaymentFailure } = await import("./payment-failure.js");
      const result = await handlePaymentFailure(
        store,
        db,
        orgId,
        paymentKey,
        webhookEvent,
      );
      return {
        approvalIds: result.approvalIds,
        proposals: result.proposals,
      };
    },
    getLedger: async () => {
      const { getLedger } = await import("./ledger.js");
      return getLedger(store, orgId);
    },
    searchMemories: (query) => searchMemories(db, orgId, query),
    recordMemory: (input) =>
      recordMemory(db, orgId, {
        kind: input.kind,
        subject: input.subject,
        content: input.content,
        tags: input.tags,
        source: { type: "agent", actor },
      }),
  };
}

function isAgentId(value: string): value is AgentId {
  return value in AGENT_DEFINITIONS;
}

export async function handleAgentMessage(
  db: Db,
  store: GraphStore,
  env: Env,
  orgId: string,
  input: {
    message: string;
    contextNodeKey?: string;
    actor: string;
    agentId?: AgentId;
    attachments?: AgentAttachment[];
  },
  onEvent: (event: AgentStreamEvent) => void,
): Promise<AgentThread> {
  if (!env.OPENAI_API_KEY) {
    throw new LlmNotConfiguredError();
  }

  const agentId: AgentId = input.agentId ?? "governor";
  if (!isAgentId(agentId)) {
    throw new Error(`unknown_agent:${agentId}`);
  }

  const thread = await getOrCreateThread(db, orgId);
  await setActiveAgentId(db, orgId, agentId);

  const org = await store.getNodeByKey(orgId, "Org:Arka-Atelier");
  const exceptions = await store.exceptions(orgId);
  const ctx = buildToolContext(db, store, env, orgId, agentId);

  const memories = await memoriesForContext(db, orgId, {
    ...(input.contextNodeKey
      ? { nodeKey: input.contextNodeKey }
      : {}),
  });
  const memoryStrings = memories.map((m) => m.content);

  const enrichedMessage = enrichMessageWithAttachments(
    input.message,
    input.attachments,
  );
  const attachmentMeta = input.attachments?.map(({ name, type, size }) => ({
    name,
    type,
    size,
  }));
  const turnOptions =
    attachmentMeta && attachmentMeta.length > 0
      ? { attachments: attachmentMeta }
      : undefined;

  const commonDeps = {
    model: env.OPENAI_MODEL,
    apiKey: env.OPENAI_API_KEY,
    orgId,
    orgLabel: org?.label ?? "Arka Atelier",
    actor: input.actor,
    contextNodeKey: input.contextNodeKey ?? null,
    exceptionCount: exceptions.length,
    memories: memoryStrings,
    threadEntries: thread.entries,
    onToolStart: async (entry: ThreadEntry) => {
      const updated = await appendEntry(db, orgId, entry);
      onEvent({ type: "thread", thread: updated });
    },
    onToolFinish: async (
      entryId: string,
      update: Partial<Extract<ThreadEntry, { kind: "tool" }>>,
    ) => {
      const updated = await updateToolEntry(db, orgId, entryId, update);
      onEvent({ type: "thread", thread: updated });
    },
    onTextDelta: (delta: string) => onEvent({ type: "text-delta", delta }),
    onUserEntry: async (entry: ThreadEntry) => {
      const updated = await appendEntry(db, orgId, entry);
      onEvent({ type: "thread", thread: updated });
    },
  };

  const result =
    agentId === "governor"
      ? await runGovernorTurn(
          {
            ...commonDeps,
            tools: buildTools(ctx),
            consultAgents: async (requests) =>
              consultAgentsParallel(requests, {
                model: env.OPENAI_MODEL,
                apiKey: env.OPENAI_API_KEY!,
                orgId,
                orgLabel: org?.label ?? "Arka Atelier",
                contextNodeKey: input.contextNodeKey ?? null,
                exceptionCount: exceptions.length,
                memories: memoryStrings,
                toolContext: ctx,
                onConsultStart: async (entry) => {
                  const updated = await appendEntry(db, orgId, entry);
                  onEvent({ type: "thread", thread: updated });
                },
                onConsultFinish: async (entryId, update) => {
                  const updated = await updateConsultEntry(
                    db,
                    orgId,
                    entryId,
                    update,
                  );
                  onEvent({ type: "thread", thread: updated });
                },
                onToolStart: commonDeps.onToolStart,
                onToolFinish: commonDeps.onToolFinish,
              }),
          },
          enrichedMessage,
          turnOptions,
        )
      : await runSpecialistTurn(
          {
            ...commonDeps,
            agentId,
            tools: buildToolsForAgent(ctx, agentId),
          },
          enrichedMessage,
          turnOptions,
        );

  const toAppend = result.newEntries.filter((e) => e.kind === "assistant");
  let updated = await appendEntries(db, orgId, toAppend);

  if (result.pendingApproval) {
    updated = await setPending(db, orgId, result.pendingApproval);
  }

  onEvent({ type: "done", thread: updated });
  return updated;
}

export async function resumeAfterApproval(
  db: Db,
  store: GraphStore,
  env: Env,
  orgId: string,
  approvalId: string,
): Promise<{ thread: AgentThread; assistantMessage: string }> {
  const thread = await getOrCreateThread(db, orgId);
  if (!thread.pending || thread.pending.approvalId !== approvalId) {
    throw new AgentResumeMismatchError(approvalId);
  }

  const approval = await getApproval(db, orgId, approvalId);
  if (!approval) {
    throw new AgentResumeMismatchError(approvalId);
  }
  if (approval.status === "pending") {
    throw new AgentApprovalStillPendingError(approvalId);
  }

  const status =
    approval.status === "approved" || approval.status === "edited"
      ? ("approved" as const)
      : ("rejected" as const);

  // PO commits run in resolveApproval → executeApprovedAction; resume only acknowledges.
  if (approval.proposedAction.action === "po.create") {
    const now = new Date().toISOString();
    const poKey = String(approval.proposedAction.metadata?.poKey ?? "PO");
    const toolUpdate =
      status === "approved"
        ? {
            status: "done" as const,
            output: { status: "created", poKey },
            error: null,
            completedAt: now,
          }
        : {
            status: "error" as const,
            error: "Operator rejected the approval.",
            output: { status: "rejected" },
            completedAt: now,
          };
    let updated = await updateToolEntry(
      db,
      orgId,
      thread.pending.toolEntryId,
      toolUpdate,
    );
    const assistantMessage =
      status === "approved"
        ? `Purchase order ${poKey} created on the graph.`
        : "Purchase order not created — you rejected the approval.";
    const assistantEntry: ThreadEntry = {
      id: `entry_${ulid()}`,
      kind: "assistant",
      content: assistantMessage,
      createdAt: now,
    };
    updated = await appendEntry(db, orgId, assistantEntry);
    updated = await clearPending(db, orgId);
    return { thread: updated, assistantMessage };
  }

  const ctx = buildToolContext(db, store, env, orgId, "governor", {
    skipPolicy: status === "approved",
  });

  const resume = await runGovernorResume({
    approvalStatus: status,
    pending: thread.pending,
    executeMoney: async (moneyInput) =>
      moneyCreatePaymentLink(ctx, moneyInput),
  });

  let updated = await updateToolEntry(
    db,
    orgId,
    thread.pending.toolEntryId,
    resume.toolUpdate,
  );

  const assistantEntry: ThreadEntry = {
    id: `entry_${ulid()}`,
    kind: "assistant",
    content: resume.assistantMessage,
    createdAt: new Date().toISOString(),
  };
  updated = await appendEntry(db, orgId, assistantEntry);
  updated = await clearPending(db, orgId);

  return { thread: updated, assistantMessage: resume.assistantMessage };
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("llm_not_configured");
    this.name = "LlmNotConfiguredError";
  }
}

export class AgentResumeMismatchError extends Error {
  constructor(approvalId: string) {
    super(`No pending agent approval for ${approvalId}`);
    this.name = "AgentResumeMismatchError";
  }
}

export class AgentApprovalStillPendingError extends Error {
  constructor(approvalId: string) {
    super(`Approval still pending: ${approvalId}`);
    this.name = "AgentApprovalStillPendingError";
  }
}
