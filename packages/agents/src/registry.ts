import { TOOL_SIDE_EFFECTS } from "./tools/index.js";
import type { AgentDefinition, AgentId } from "./types.js";

/** Shared read tools every specialist gets */
export const SHARED_READ_TOOLS = [
  "query_graph",
  "list_all_data",
  "graph_get_neighborhood",
  "graph_find_path",
  "graph_get_impact",
  "graph_list_exceptions",
  "memory_search",
] as const;

/** Write/create tools — any agent may need to create business entities */
export const SHARED_WRITE_TOOLS = [
  "create_customer",
  "create_vendor",
  "create_invoice",
  "create_sku",
  "create_material",
  "create_lead",
  "create_sales_order",
  "record_payment",
  "create_meeting",
  "update_node",
] as const;

const FINANCE_TOOLS = [
  ...SHARED_READ_TOOLS,
  ...SHARED_WRITE_TOOLS,
  "money_create_payment_link",
  "money_list_overdue_invoices",
  "money_propose_collection",
  "money_run_collections_loop",
  "money_classify_failure",
  "money_impact_query",
  "money_propose_recovery",
  "money_propose_payout",
  "money_get_ledger",
  "generate_report",
  "root_cause_analysis",
  "memory_record",
] as const;

const PROCUREMENT_TOOLS = [
  ...SHARED_READ_TOOLS,
  ...SHARED_WRITE_TOOLS,
  "inventory_check_stock",
  "inventory_promise_query",
  "sourcing_explain_need",
  "sourcing_search_vendors",
  "sourcing_browse_public",
  "sourcing_draft_po",
  "comms_draft_email",
  "generate_report",
  "memory_record",
] as const;

const SALES_TOOLS = [
  ...SHARED_READ_TOOLS,
  ...SHARED_WRITE_TOOLS,
  "sales_get_order_book",
  "sales_generate_quote",
  "sales_accept_order",
  "sales_reject_order",
  "inventory_promise_query",
  "listings_draft_copy",
  "comms_draft_email",
  "generate_report",
  "memory_record",
] as const;

const OPERATIONS_TOOLS = [
  ...SHARED_READ_TOOLS,
  ...SHARED_WRITE_TOOLS,
  "inventory_check_stock",
  "inventory_promise_query",
  "calendar_meeting_brief",
  "root_cause_analysis",
  "generate_report",
  "comms_draft_email",
  "memory_record",
] as const;

const GOVERNOR_TOOLS = Object.keys(TOOL_SIDE_EFFECTS);

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  governor: {
    id: "governor",
    displayName: "Governor",
    shortName: "Governor",
    icon: "🏛️",
    description: "Operations lead that orchestrates specialist agents",
    toolNames: [...GOVERNOR_TOOLS],
    canConsult: false,
    canDirectChat: true,
  },
  finance: {
    id: "finance",
    displayName: "Finance Agent",
    shortName: "Finance",
    icon: "💰",
    description: "Cash, receivables, payables, and margin",
    toolNames: [...FINANCE_TOOLS],
    canConsult: true,
    canDirectChat: true,
  },
  procurement: {
    id: "procurement",
    displayName: "Procurement Agent",
    shortName: "Procurement",
    icon: "📦",
    description: "Stock, vendors, POs, and material costs",
    toolNames: [...PROCUREMENT_TOOLS],
    canConsult: true,
    canDirectChat: true,
  },
  sales: {
    id: "sales",
    displayName: "Sales Agent",
    shortName: "Sales",
    icon: "📈",
    description: "Pipeline, fulfillment, and revenue",
    toolNames: [...SALES_TOOLS],
    canConsult: true,
    canDirectChat: true,
  },
  operations: {
    id: "operations",
    displayName: "Operations Agent",
    shortName: "Operations",
    icon: "⚙️",
    description: "Production, scheduling, and coordination",
    toolNames: [...OPERATIONS_TOOLS],
    canConsult: true,
    canDirectChat: true,
  },
};

function assertPartitionToolsExist(): void {
  for (const def of Object.values(AGENT_DEFINITIONS)) {
    for (const name of def.toolNames) {
      if (!(name in TOOL_SIDE_EFFECTS)) {
        throw new Error(
          `Agent "${def.id}" references unknown tool "${name}"`,
        );
      }
    }
  }
}

assertPartitionToolsExist();

export function toolNamesForAgent(id: AgentId): string[] {
  return [...AGENT_DEFINITIONS[id].toolNames];
}

export function getAgentDefinition(id: AgentId): AgentDefinition {
  return AGENT_DEFINITIONS[id];
}

export function listConsultableAgents(): AgentDefinition[] {
  return Object.values(AGENT_DEFINITIONS).filter((a) => a.canConsult);
}
