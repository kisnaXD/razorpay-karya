import { apiUrl } from "./api-base";

const ORG_HEADER = { "x-org-id": "org_arka" } as const;

export { apiUrl, getApiBaseUrl } from "./api-base";

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: ORG_HEADER,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { ...ORG_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${path} ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) detail = errBody.error;
    } catch {
      // keep status message
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export function slugifyKey(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CreateNodeBody = {
  type: string;
  key: string;
  label: string;
  props?: Record<string, string | number | boolean | null>;
};

export async function createNode(
  body: CreateNodeBody,
): Promise<ApiNodeFull> {
  const res = await apiPost<{ node: ApiNodeFull }>("/v1/nodes", body);
  return res.node;
}

export type CreateEdgeBody = {
  type: string;
  fromKey: string;
  toKey: string;
  props?: Record<string, string | number | boolean | null>;
};

export async function createEdge(
  body: CreateEdgeBody,
): Promise<ApiEdge> {
  const res = await apiPost<{ edge: ApiEdge }>("/v1/edges", body);
  return res.edge;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { ...ORG_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: { ...ORG_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export async function seedOnceIfEmpty(): Promise<void> {
  try {
    const { node } = await api<{ node: unknown }>("/v1/nodes/Org:Arka-Atelier");
    if (node) return;
  } catch {
    // 404 or error — seed needed
  }
  const res = await fetch(apiUrl("/v1/admin/seed"), {
    method: "POST",
    headers: ORG_HEADER,
  });
  if (!res.ok) throw new Error(`/v1/admin/seed ${res.status}`);
}

export type ApiException = {
  id: string;
  severity: "risk" | "warn";
  code: string;
  nodeId: string;
  title: string;
  detail: string;
  nodeKey?: string;
  why?: string;
  recommendation?: string;
  actions?: InboxAction[];
  domain?: "finance" | "procurement" | "sales" | "inventory";
  priority?: "critical" | "high" | "medium" | "low";
};

export type InboxAction = {
  id: string;
  label: string;
  kind: "agent_prompt" | "navigate";
  payload: {
    message?: string;
    nodeKey?: string;
  };
};

export type MorningBriefing = {
  greeting: string;
  summary: string;
  byDomain: Record<string, number>;
  topItems: ApiException[];
  generatedAt: string;
};

export type InboxResponse = {
  exceptions: ApiException[];
  briefing: MorningBriefing;
};

export async function fetchInbox(): Promise<InboxResponse> {
  return api<InboxResponse>("/v1/inbox");
}

export async function fetchInboxBriefing(): Promise<{ briefing: MorningBriefing }> {
  return api<{ briefing: MorningBriefing }>("/v1/inbox/briefing");
}

export type ApiNode = {
  _id: string;
  type: string;
  key: string;
  label: string;
};

export type ApiEdge = {
  _id: string;
  type: string;
  fromId: string;
  toId: string;
  props: Record<string, string | number | boolean | null>;
};

export type ApiNodeFull = ApiNode & {
  props: Record<string, string | number | boolean | null>;
};

export type ConsoleView =
  | "dashboard"
  | "customers"
  | "sales-orders"
  | "invoices"
  | "payment-links"
  | "vendors"
  | "purchase-orders"
  | "bills"
  | "items"
  | "stock-levels"
  | "stock-movements"
  | "boms"
  | "work-orders"
  | "accounts"
  | "ledger"
  | "audit-log"
  | "contacts"
  | "organizations"
  | "sales-reports"
  | "inventory-reports"
  | "company-settings"
  | "policies"
  | "users"
  | "graph"
  | "inbox";

/** Anchor keys for merging neighborhood edges — covers Arka seed connected components */
export const GRAPH_ANCHOR_KEYS = [
  "Org:Arka-Atelier",
  "SalesOrder:SO-218",
  "PurchaseOrder:PO-104",
  "Invoice:INV-90",
  "SalesOrder:SO-201",
] as const;

export type Bootstrap = {
  org: ApiNode;
  exceptionCount: number;
  cashInPaise: number;
};

export type { Neighborhood } from "./neighborhood";
export { neighborhoodKeysFrom, neighborhoodPath } from "./neighborhood";

export type PolicyDecision = "allow" | "deny" | "require_approval";

export type PolicyDto = {
  node: ApiNodeFull;
  compiled: {
    action: string;
    effect: PolicyDecision;
    description: string;
    rules: { field: string; op: string; value?: unknown }[];
  };
};

export type ApprovalDto = {
  _id: string;
  orgId: string;
  status: "pending" | "approved" | "rejected" | "edited";
  proposedAction: {
    action: string;
    orgId: string;
    amountInPaise?: number;
    targetNodeKey?: string;
    explanation: string;
    proposedBy: string;
    metadata?: Record<string, string | number | boolean | null>;
  };
  evaluation: {
    finalDecision: PolicyDecision;
    results: {
      policyKey: string | null;
      policyLabel: string | null;
      decision: PolicyDecision;
    }[];
  };
  why: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEventDto = ApiNodeFull & {
  props: ApiNodeFull["props"] & {
    event_type: string;
    payload_json: string;
    at: string;
  };
};

export async function fetchPolicies(): Promise<PolicyDto[]> {
  const res = await api<{ policies: PolicyDto[] }>("/v1/policies");
  return res.policies;
}

export async function togglePolicy(
  key: string,
  enabled: boolean,
): Promise<void> {
  await apiPost(`/v1/policies/${encodeURIComponent(key)}/toggle`, { enabled });
}

export type AuthorityAction = {
  action: string;
  label: string;
  currentEffect: "allow" | "require_approval" | "deny";
  threshold?: string;
  policyKey?: string;
  description: string;
};

export async function fetchAuthority(): Promise<{ actions: AuthorityAction[] }> {
  return api<{ actions: AuthorityAction[] }>("/v1/policies/authority");
}

export async function updateAuthority(
  policyKey: string,
  effect: string,
): Promise<void> {
  await apiPut(`/v1/policies/${encodeURIComponent(policyKey)}/authority`, {
    effect,
  });
}

export async function fetchPendingApprovals(): Promise<ApprovalDto[]> {
  const res = await api<{ approvals: ApprovalDto[] }>(
    "/v1/approvals?status=pending",
  );
  return res.approvals;
}

export async function resolveApproval(
  id: string,
  status: "approved" | "rejected",
): Promise<void> {
  await apiPost(`/v1/approvals/${id}/resolve`, {
    status,
    resolvedBy: "human:anika@arka.atelier",
  });
}

export async function fetchAuditEvents(limit = 20): Promise<AuditEventDto[]> {
  const res = await api<{ events: AuditEventDto[] }>(
    `/v1/audit?limit=${limit}`,
  );
  return res.events;
}

export type LedgerEntryDto = {
  node: ApiNodeFull;
  direction: "in" | "out";
  amountInPaise: number;
  status: string;
  counterparty: string | null;
  at: string;
};

export type LedgerSummary = {
  cashInPaise: number;
  receivablesInPaise: number;
  payablesInPaise: number;
  payoutsOutInPaise: number;
  entries: LedgerEntryDto[];
};

export async function fetchLedger(): Promise<LedgerSummary> {
  return api<LedgerSummary>("/v1/ledger");
}

export type AgentKpiDto = {
  label: string;
  value: string;
  trend?: string;
  why?: string;
  nodeKey?: string;
};

export type AgentKpisResponse = {
  kpis: AgentKpiDto[];
  generatedAt: string;
};

export async function fetchAgentKpis(): Promise<AgentKpisResponse> {
  return api<AgentKpisResponse>("/v1/dashboard/agent-kpis");
}

export async function fetchAuditFiltered(params: {
  actor?: string;
  sideEffectClass?: string;
  minAmountPaise?: number;
  limit?: number;
}): Promise<AuditEventDto[]> {
  const q = new URLSearchParams();
  if (params.actor) q.set("actor", params.actor);
  if (params.sideEffectClass) q.set("sideEffectClass", params.sideEffectClass);
  if (params.minAmountPaise !== undefined) {
    q.set("minAmountPaise", String(params.minAmountPaise));
  }
  q.set("limit", String(params.limit ?? 50));
  const res = await api<{ events: AuditEventDto[] }>(`/v1/audit?${q}`);
  return res.events;
}

export async function simulateWebhook(body: {
  event: string;
  paymentKey?: string;
  paymentLinkId?: string;
}): Promise<{ received: boolean }> {
  return apiPost("/v1/admin/simulate-webhook", body);
}

export async function runCollectionsLoop(): Promise<{
  processed: Array<{ invoiceKey: string; outcome: string }>;
}> {
  return apiPost("/v1/admin/run-collections", {});
}

export type SideEffectClass =  | "read"
  | "draft"
  | "write"
  | "money"
  | "external";

export type ToolTraceStatus =
  | "running"
  | "done"
  | "error"
  | "awaiting_approval";

export type AgentId =
  | "governor"
  | "finance"
  | "procurement"
  | "sales"
  | "operations";

export type AgentPersonaDto = {
  id: AgentId;
  displayName: string;
  shortName: string;
  icon: string;
  description: string;
};

export const FALLBACK_AGENT_PERSONAS: AgentPersonaDto[] = [
  {
    id: "governor",
    displayName: "Governor",
    shortName: "Governor",
    icon: "🎯",
    description: "Orchestrates all departments",
  },
  {
    id: "finance",
    displayName: "Finance Agent",
    shortName: "Finance",
    icon: "💰",
    description: "Invoices, collections, cash flow",
  },
  {
    id: "procurement",
    displayName: "Procurement Agent",
    shortName: "Procurement",
    icon: "📦",
    description: "Stock, vendors, purchase orders",
  },
  {
    id: "sales",
    displayName: "Sales Agent",
    shortName: "Sales",
    icon: "📈",
    description: "Pipeline, orders, revenue",
  },
  {
    id: "operations",
    displayName: "Operations Agent",
    shortName: "Operations",
    icon: "⚙️",
    description: "Work orders, production, scheduling",
  },
];

export async function fetchAgentPersonas(): Promise<AgentPersonaDto[]> {
  try {
    const res = await api<{ personas: AgentPersonaDto[] }>("/v1/agent/personas");
    return res.personas;
  } catch {
    return FALLBACK_AGENT_PERSONAS;
  }
}

export type ConsultStatus = "running" | "done" | "error";

export type AgentAttachment = {
  name: string;
  type: string; // MIME type
  data: string; // base64
  size: number;
};

export type AgentAttachmentMeta = {
  name: string;
  type: string;
  size: number;
};

export type AgentThreadEntryDto =
  | {
      id: string;
      kind: "user";
      content: string;
      contextNodeKey: string | null;
      createdAt: string;
      attachments?: AgentAttachmentMeta[];
    }
  | {
      id: string;
      kind: "assistant";
      content: string;
      agentId?: AgentId;
      createdAt: string;
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
      consultEntryId?: string | null;
      createdAt: string;
      completedAt: string | null;
    }
  | {
      id: string;
      kind: "consult";
      agentId: AgentId;
      question: string;
      findings: string | null;
      status: ConsultStatus;
      error?: string | null;
      createdAt: string;
      completedAt?: string | null;
    };

export type AgentThreadDto = {
  _id: string;
  orgId: string;
  entries: AgentThreadEntryDto[];
  pending: {
    approvalId: string;
    toolEntryId: string;
    resumePayload: Record<string, unknown>;
  } | null;
  updatedAt: string;
};

export type AgentStreamEvent =
  | { type: "thread"; thread: AgentThreadDto }
  | { type: "text-delta"; delta: string }
  | { type: "done"; thread: AgentThreadDto }
  | { type: "error"; message: string };

export async function fetchAgentThread(): Promise<AgentThreadDto> {
  const res = await api<{ thread: AgentThreadDto }>("/v1/agent/thread");
  return res.thread;
}

export async function sendAgentMessage(
  message: string,
  options?: {
    contextNodeKey?: string;
    agentId?: AgentId;
    attachments?: AgentAttachment[];
    onEvent?: (ev: AgentStreamEvent) => void;
  },
): Promise<AgentThreadDto> {
  const { contextNodeKey, agentId, attachments, onEvent } = options ?? {};
  const res = await fetch(apiUrl("/v1/agent/message"), {
    method: "POST",
    headers: { ...ORG_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      ...(contextNodeKey ? { contextNodeKey } : {}),
      ...(agentId ? { agentId } : {}),
      ...(attachments?.length ? { attachments } : {}),
    }),
  });

  if (res.status === 503) {
    throw new LlmNotConfiguredError();
  }
  if (!res.ok) {
    throw new Error(`/v1/agent/message ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalThread: AgentThreadDto | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as AgentStreamEvent;
      onEvent?.(event);
      if (event.type === "done" || event.type === "thread") {
        finalThread = event.thread;
      }
      if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  }

  if (!finalThread) {
    throw new Error("Agent stream ended without thread");
  }
  return finalThread;
}

export async function resumeAgent(
  approvalId: string,
): Promise<{ thread: AgentThreadDto; assistantMessage: string }> {
  return apiPost("/v1/agent/resume", { approvalId });
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("llm_not_configured");
    this.name = "LlmNotConfiguredError";
  }
}

/** Step 8 — Sourcing vendor shortlist / draft PO */
export type SourcingVendorHit = {
  orgKey: string;
  label: string;
  city: string;
  materialKeys: string[];
  pricePerKgInPaise: number;
  leadDays: number;
  verified_bank: boolean;
  notes: string;
  rank: number;
};

export type SourcingNeedResult = {
  materialKey: string;
  reorderPoint: number;
  onHandKg: number;
  reservedKg: number;
  incomingKg: number;
  blockers: Array<{ nodeKey: string; detail: string }>;
  suggestedQtyKg: number;
  whyParagraph: string;
};

export type DraftPoPreview = {
  poKey: string;
  vendorLabel: string;
  materialLabel: string;
  qtyKg: number;
  estimatedTotalInPaise: number;
  expectedAt: string;
  why: string;
};

export async function fetchSourcingVendors(
  materialKey = "Material:BrassSheet-22g",
  limit = 3,
): Promise<{ vendors: SourcingVendorHit[]; source: string }> {
  return api(
    `/v1/sourcing/vendors?materialKey=${encodeURIComponent(materialKey)}&limit=${limit}`,
  );
}

export async function fetchSourcingNeed(
  materialKey: string,
  soKey?: string,
): Promise<SourcingNeedResult> {
  const qs = new URLSearchParams({ materialKey });
  if (soKey) qs.set("soKey", soKey);
  return api(`/v1/sourcing/need?${qs.toString()}`);
}

export async function draftSourcingPo(body: {
  vendorOrgKey: string;
  materialKey: string;
  qtyKg: number;
  reasonSalesOrderKeys?: string[];
  expectedAtDays?: number;
  explanation: string;
}): Promise<{ approvalId: string; preview: DraftPoPreview }> {
  return apiPost("/v1/sourcing/draft-po", body);
}

/** Step 9 — People / Calendar / Listings / Comms */
export type TimelineEntryDto = {
  at: string;
  kind: "message" | "order" | "payment" | "meeting" | "invoice";
  nodeKey: string;
  label: string;
  summary: string;
};

export type MeetingBriefDto = {
  meetingKey: string;
  label: string;
  startsAt: string;
  attendeeOrgKey: string | null;
  sections: { heading: string; body: string }[];
  proposedAsk: string;
};

export type ListingDraftDto = {
  listingKey: string;
  draft: {
    title: string;
    bullets: string[];
    hashtags: string[];
  };
};

export type EmailDraftDto = {
  messageKey: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

export async function fetchPeopleOrgs(): Promise<{ orgs: ApiNodeFull[] }> {
  return api("/v1/people/orgs");
}

export async function fetchOrgTimeline(
  orgKey: string,
): Promise<{ org: ApiNodeFull; entries: TimelineEntryDto[] }> {
  return api(`/v1/people/${encodeURIComponent(orgKey)}/timeline`);
}

export async function fetchCalendarMeetings(params?: {
  from?: string;
  to?: string;
}): Promise<{ meetings: ApiNodeFull[] }> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return api(`/v1/calendar/meetings${qs ? `?${qs}` : ""}`);
}

export async function fetchMeetingBrief(
  meetingKey: string,
): Promise<{ brief: MeetingBriefDto }> {
  return api(
    `/v1/calendar/brief?meetingKey=${encodeURIComponent(meetingKey)}`,
  );
}

export async function createCalendarFollowUp(body: {
  meetingKey: string;
  note?: string;
}): Promise<{ task: ApiNodeFull }> {
  return apiPost("/v1/calendar/follow-up", body);
}

export async function fetchListing(
  listingKey = "Listing:Diya-Large-Instagram",
): Promise<{ listing: ApiNodeFull; sku: ApiNodeFull | null }> {
  return api(
    `/v1/listings?listingKey=${encodeURIComponent(listingKey)}`,
  );
}

export async function draftListingCopy(body: {
  skuKey: string;
  channel?: "instagram" | "catalog";
}): Promise<ListingDraftDto> {
  return apiPost("/v1/listings/draft", body);
}

export async function publishListing(body: {
  listingKey: string;
  explanation?: string;
}): Promise<{ approval: ApprovalDto } | { autoAllowed: true }> {
  return apiPost("/v1/listings/publish", body);
}

export async function draftCommsEmail(body: {
  aboutNodeKey: string;
  recipientOrgKey: string;
  tone?: "firm" | "friendly";
}): Promise<EmailDraftDto> {
  return apiPost("/v1/comms/draft-email", body);
}

export async function sendCommsEmail(body: {
  messageKey: string;
  explanation?: string;
}): Promise<{ approval: ApprovalDto } | { autoAllowed: true }> {
  return apiPost("/v1/comms/send", body);
}

export type UserDto = {
  _id: string;
  email: string;
  name: string;
  phone: string | null;
  roleIds: string[];
  status: "active" | "invited" | "disabled";
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type RoleDto = {
  id: string;
  name: string;
  description: string;
  permissions: { module: string; actions: string[] }[];
};

export async function fetchUsers(params?: {
  status?: string;
  role?: string;
}): Promise<UserDto[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.role) q.set("role", params.role);
  const qs = q.toString();
  const res = await api<{ users: UserDto[] }>(
    `/v1/users${qs ? `?${qs}` : ""}`,
  );
  return res.users;
}

export async function fetchRoles(): Promise<RoleDto[]> {
  const res = await api<{ roles: RoleDto[] }>("/v1/roles");
  return res.roles;
}

export async function updateUserStatus(
  userId: string,
  status: string,
): Promise<void> {
  await apiPatch(`/v1/users/${userId}`, { status });
}

export type BomDto = {
  _id: string;
  bomNo: string;
  itemKey: string;
  itemName: string;
  quantity: number;
  uom: string;
  status: "draft" | "active" | "inactive";
  isDefault: boolean;
  lines: {
    lineNo: number;
    itemKey: string;
    itemName: string;
    itemType: string;
    quantity: number;
    uom: string;
    ratePaise: number;
    amountPaise: number;
  }[];
  operations: {
    sequence: number;
    operationName: string;
    workCenter: string;
    timeMinutes: number;
    hourlyRatePaise: number;
    operatingCostPaise: number;
  }[];
  rawMaterialCostPaise: number;
  operationCostPaise: number;
  totalCostPaise: number;
};

export async function fetchBoms(status?: string): Promise<BomDto[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await api<{ boms: BomDto[] }>(`/v1/boms${qs}`);
  return res.boms;
}

export async function fetchBom(id: string): Promise<BomDto> {
  const res = await api<{ bom: BomDto }>(`/v1/boms/${id}`);
  return res.bom;
}

export type CreateBomBody = {
  name: string;
  skuKey: string;
  components: Array<{ materialKey: string; qty: number; unit: string }>;
  notes?: string;
};

export async function createBom(body: CreateBomBody): Promise<BomDto> {
  const res = await apiPost<{ bom: BomDto }>("/v1/boms", body);
  return res.bom;
}

export type WorkOrderDto = {
  _id: string;
  woNo: string;
  itemKey: string;
  itemName: string;
  bomId: string | null;
  bomNo: string | null;
  quantity: number;
  uom: string;
  producedQty: number;
  processLossQty: number;
  status: string;
  priority: string;
  materialStatus: string;
  materialNote: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  salesOrderKey: string | null;
  materials: {
    itemKey: string;
    itemName: string;
    requiredQty: number;
    transferredQty: number;
    consumedQty: number;
    availableQty: number;
    uom: string;
  }[];
  jobCards: {
    jcId: string;
    jcNo: string;
    operationName: string;
    assignedTo: string | null;
    status: string;
    forQuantity: number;
    completedQty: number;
    timeMinutes: number;
  }[];
  plannedMaterialCostPaise: number;
  actualMaterialCostPaise: number | null;
  plannedOperationCostPaise: number;
  actualOperationCostPaise: number | null;
  totalCostPaise: number;
};

export async function fetchWorkOrders(status?: string): Promise<WorkOrderDto[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await api<{ workOrders: WorkOrderDto[] }>(`/v1/work-orders${qs}`);
  return res.workOrders;
}

export async function fetchWorkOrder(id: string): Promise<WorkOrderDto> {
  const res = await api<{ workOrder: WorkOrderDto }>(`/v1/work-orders/${id}`);
  return res.workOrder;
}

export type CreateWorkOrderBody = {
  bomId: string;
  qty: number;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string;
  notes?: string;
};

export async function createWorkOrder(
  body: CreateWorkOrderBody,
): Promise<WorkOrderDto> {
  const res = await apiPost<{ workOrder: WorkOrderDto }>(
    "/v1/work-orders",
    body,
  );
  return res.workOrder;
}
