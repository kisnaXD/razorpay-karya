import type { GraphStore } from "@karya/graph";
import type { EvaluateOutcome, ProposedAction } from "@karya/policy";
import type {
  PromiseQueryInput,
  PromiseQueryResult,
} from "./promise.js";

export type ToolTraceStatus =
  | "running"
  | "done"
  | "error"
  | "awaiting_approval";

export type SideEffectClass =
  | "read"
  | "draft"
  | "write"
  | "money"
  | "external";

export type AgentId =
  | "governor"
  | "finance"
  | "procurement"
  | "sales"
  | "operations";

export type AgentDefinition = {
  id: AgentId;
  displayName: string;
  shortName: string;
  icon: string;
  description: string;
  toolNames: string[];
  canConsult: boolean;
  canDirectChat: boolean;
};

export type ConsultFinding = {
  agentId: AgentId;
  question: string;
  findings: string;
  status: "running" | "done" | "error";
  error?: string;
};

export type ThreadAttachment = {
  name: string;
  type: string;
  size: number;
};

export type ThreadEntry =
  | {
      id: string;
      kind: "user";
      content: string;
      contextNodeKey: string | null;
      createdAt: string;
      attachments?: ThreadAttachment[];
    }
  | {
      id: string;
      kind: "assistant";
      content: string;
      createdAt: string;
      agentId?: AgentId;
    }
  | {
      id: string;
      kind: "tool";
      toolName: string;
      sideEffectClass: SideEffectClass;
      status: ToolTraceStatus;
      explanation: string;
      input: Record<string, unknown>;
      output: unknown | null;
      error: string | null;
      approvalId: string | null;
      createdAt: string;
      completedAt: string | null;
      agentId?: AgentId;
      consultEntryId?: string;
    }
  | {
      id: string;
      kind: "consult";
      agentId: AgentId;
      question: string;
      findings: string | null;
      status: "running" | "done" | "error";
      error: string | null;
      createdAt: string;
      completedAt: string | null;
    };

export type AgentThread = {
  _id: string;
  orgId: string;
  entries: ThreadEntry[];
  pending: {
    approvalId: string;
    toolEntryId: string;
    resumePayload: Record<string, unknown>;
  } | null;
  updatedAt: Date;
  activeAgentId?: AgentId;
};

export type OrderBookRow = {
  key: string;
  label: string;
  status: string;
  customerOrgKey: string | null;
  customerLabel: string | null;
  promiseDate: string | null;
  lines: Array<{ skuKey: string; skuLabel: string; qty: number }>;
  invoiceKey: string | null;
  amountInPaise: number | null;
};

export type QuoteResult = {
  skuKey: string;
  qty: number;
  unitPriceInPaise: number;
  subtotalInPaise: number;
  gstRate: number;
  gstInPaise: number;
  totalInPaise: number;
  materials: Array<{ materialKey: string; qtyPerUnit: number; uom: string }>;
};

export type CreatePaymentLinkResult = {
  paymentNode: { key: string };
  razorpay: { short_url: string };
  created: boolean;
};

export type CreateApprovalResult =
  | { approval: { _id: string } }
  | { autoAllowed: true; evaluation: EvaluateOutcome };

export type ToolContext = {
  orgId: string;
  store: GraphStore;
  evaluateAction: (proposed: ProposedAction) => Promise<EvaluateOutcome>;
  createApproval: (proposed: ProposedAction) => Promise<CreateApprovalResult>;
  /** PO keys reserved by pending po.create approvals (avoids duplicate keys). */
  listReservedPoKeys?: () => Promise<string[]>;
  createPaymentLink: (input: {
    invoiceKey: string;
  }) => Promise<CreatePaymentLinkResult>;
  writeAudit: (input: {
    eventType: string;
    sideEffectClass: SideEffectClass;
    payload: Record<string, unknown>;
    aboutNodeIds?: string[];
  }) => Promise<unknown>;
  promiseQuery: (
    input: Omit<PromiseQueryInput, "orgId">,
  ) => Promise<PromiseQueryResult>;
  getOrderBook: (filter?: { status?: string }) => Promise<OrderBookRow[]>;
  generateQuote: (input: {
    skuKey: string;
    qty: number;
    customerOrgKey?: string;
  }) => Promise<QuoteResult>;
  acceptSalesOrder: (input: {
    customerOrgKey: string;
    skuKey: string;
    qty: number;
    promiseDate: string;
    actor: string;
  }) => Promise<{
    salesOrder: { key: string; label: string };
    promiseResult: PromiseQueryResult;
  }>;
  rejectSalesOrder: (input: {
    salesOrderKey: string;
    reason: string;
    actor: string;
  }) => Promise<{ key: string; label: string; status: string }>;
  /** When true, money tool skips policy and executes (post-approval resume). */
  skipPolicy?: boolean;
  runCollectionsLoop?: () => Promise<{
    processed: Array<{ invoiceKey: string; outcome: string }>;
  }>;
  handlePaymentFailure?: (
    paymentKey: string,
    webhookEvent: string,
  ) => Promise<{
    approvalIds: string[];
    proposals: unknown[];
  }>;
  getLedger?: () => Promise<unknown>;
  searchMemories?: (query: {
    tags?: string[];
    subject?: string;
    limit?: number;
  }) => Promise<
    Array<{
      _id: string;
      kind: string;
      subject: string;
      content: string;
      tags: string[];
      useCount: number;
    }>
  >;
  recordMemory?: (input: {
    kind: "preference" | "decision";
    subject: string;
    content: string;
    tags: string[];
  }) => Promise<{
    _id: string;
    kind: string;
    subject: string;
    content: string;
    tags: string[];
  }>;
};
