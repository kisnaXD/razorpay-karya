import { tool, type CoreTool } from "ai";
import type { SideEffectClass, ToolContext } from "../types.js";
import {
  moneyClassifyFailure,
  moneyGetLedger,
  moneyImpactQuery,
  moneyListOverdueInvoices,
  moneyProposeCollection,
  moneyProposePayout,
  moneyProposeRecovery,
  moneyRunCollectionsLoop,
} from "../money/tools.js";
import {
  graphFindPath,
  graphGetImpact,
  graphGetNeighborhood,
  graphListExceptions,
} from "./graph.js";
import { listAllData, queryGraph } from "./graph-query.js";
import {
  inventoryCheckStock,
  inventoryPromiseQueryTool,
} from "./inventory.js";
import { moneyCreatePaymentLink } from "./money.js";
import {
  salesAcceptOrder,
  salesGenerateQuote,
  salesGetOrderBook,
  salesRejectOrder,
} from "./sales.js";
import {
  sourcingBrowsePublic,
  sourcingBrowsePublicSchema,
  sourcingDraftPo,
  sourcingDraftPoSchema,
  sourcingExplainNeed,
  sourcingExplainNeedSchema,
  sourcingSearchVendorsSchema,
  sourcingSearchVendorsTool,
} from "./sourcing.js";
import {
  calendarMeetingBrief,
  calendarMeetingBriefSchema,
} from "./calendar.js";
import { commsDraftEmail, commsDraftEmailSchema } from "./comms.js";
import {
  listingsDraftCopy,
  listingsDraftCopySchema,
} from "./listings.js";
import { memoryRecord, memorySearch } from "./memory.js";
import { generateReport } from "./report.js";
import { rootCauseAnalysis } from "./root-cause.js";
import {
  createCustomer,
  createInvoice,
  createLead,
  createMaterial,
  createMeeting,
  createSalesOrder,
  createSku,
  createVendor,
  recordPayment,
  updateNode,
} from "./create.js";
import {
  createCustomerSchema,
  createInvoiceSchema,
  createLeadSchema,
  createMaterialSchema,
  createMeetingSchema,
  createSalesOrderSchema,
  createSkuSchema,
  createVendorSchema,
  generateReportSchema,
  graphFindPathSchema,
  graphGetImpactSchema,
  graphListExceptionsSchema,
  graphNeighborhoodSchema,
  inventoryCheckStockSchema,
  inventoryPromiseQuerySchema,
  listAllDataSchema,
  memoryRecordSchema,
  memorySearchSchema,
  moneyClassifyFailureSchema,
  moneyCreatePaymentLinkSchema,
  moneyGetLedgerSchema,
  moneyImpactQuerySchema,
  moneyListOverdueInvoicesSchema,
  moneyProposeCollectionSchema,
  moneyProposePayoutSchema,
  moneyProposeRecoverySchema,
  moneyRunCollectionsLoopSchema,
  queryGraphSchema,
  recordPaymentSchema,
  rootCauseAnalysisSchema,
  salesAcceptOrderSchema,
  salesGenerateQuoteSchema,
  salesGetOrderBookSchema,
  salesRejectOrderSchema,
  updateNodeSchema,
} from "./schemas.js";

export const TOOL_SIDE_EFFECTS: Record<string, SideEffectClass> = {
  query_graph: "read",
  list_all_data: "read",
  root_cause_analysis: "read",
  generate_report: "read",
  graph_get_neighborhood: "read",
  graph_find_path: "read",
  graph_get_impact: "read",
  graph_list_exceptions: "read",
  inventory_promise_query: "read",
  inventory_check_stock: "read",
  sales_get_order_book: "read",
  sales_generate_quote: "draft",
  sales_accept_order: "write",
  sales_reject_order: "write",
  money_create_payment_link: "money",
  money_list_overdue_invoices: "read",
  money_propose_collection: "draft",
  money_run_collections_loop: "write",
  money_classify_failure: "read",
  money_impact_query: "read",
  money_propose_recovery: "draft",
  money_propose_payout: "draft",
  money_get_ledger: "read",
  sourcing_explain_need: "read",
  sourcing_search_vendors: "read",
  sourcing_browse_public: "external",
  sourcing_draft_po: "draft",
  comms_draft_email: "draft",
  calendar_meeting_brief: "draft",
  listings_draft_copy: "draft",
  memory_search: "read",
  memory_record: "draft",
  consult_agents: "read",
  create_customer: "write",
  create_vendor: "write",
  create_invoice: "write",
  create_sku: "write",
  create_material: "write",
  create_lead: "write",
  create_sales_order: "write",
  record_payment: "write",
  create_meeting: "write",
  update_node: "write",
};

export function buildTools(ctx: ToolContext): Record<string, CoreTool> {
  return {
    query_graph: tool({
      description:
        "Query the knowledge graph for any business data. list_nodes (optional nodeType), get_node (nodeKey), list_edges (optional edgeType), search (searchTerm), or neighborhood (nodeKey, 2-hop).",
      parameters: queryGraphSchema,
      execute: async (input) =>
        queryGraph(ctx, {
          action: input.action,
          explanation: input.explanation,
          ...(input.nodeType !== undefined ? { nodeType: input.nodeType } : {}),
          ...(input.nodeKey !== undefined ? { nodeKey: input.nodeKey } : {}),
          ...(input.searchTerm !== undefined
            ? { searchTerm: input.searchTerm }
            : {}),
          ...(input.edgeType !== undefined ? { edgeType: input.edgeType } : {}),
        }),
    }),
    list_all_data: tool({
      description:
        "Get a complete overview of all business data, grouped by type. Returns counts and summaries (key, label, status/amount/etc.) for each node type.",
      parameters: listAllDataSchema,
      execute: async () => listAllData(ctx),
    }),
    root_cause_analysis: tool({
      description:
        "Cross-department root-cause analysis. Use for questions about margins, cash flow, delays, stockouts, or any 'why' question. Returns a chain of findings across Finance, Procurement, Inventory, and Sales domains with recommended actions.",
      parameters: rootCauseAnalysisSchema,
      execute: async (input) =>
        rootCauseAnalysis(ctx.store, ctx.orgId, {
          question: input.question,
          ...(input.focusNodeKey !== undefined
            ? { focusNodeKey: input.focusNodeKey }
            : {}),
        }),
    }),
    generate_report: tool({
      description:
        "Generate a structured business report. Templates: cash_flow_forecast (receivables/payables/30-day projection), collections_priority (overdue invoices ranked by risk), inventory_health (stock levels and reorder alerts), sales_pipeline (order funnel and at-risk orders), vendor_performance (supplier scorecards). Use when user asks for reports, forecasts, summaries, or analysis.",
      parameters: generateReportSchema,
      execute: async (input) =>
        generateReport(ctx.store, ctx.orgId, {
          template: input.template,
          ...(input.params !== undefined ? { params: input.params } : {}),
        }),
    }),
    graph_get_neighborhood: tool({
      description:
        "Load 1-hop or 2-hop neighborhood around a node key. Returns node keys and edges.",
      parameters: graphNeighborhoodSchema,
      execute: async (input) => graphGetNeighborhood(ctx, input),
    }),
    graph_find_path: tool({
      description: "Find shortest path between two node keys on the org graph.",
      parameters: graphFindPathSchema,
      execute: async (input) => graphFindPath(ctx, input),
    }),
    graph_get_impact: tool({
      description:
        "Walk impact edges from a node (orders, shipments, invoices, stock).",
      parameters: graphGetImpactSchema,
      execute: async (input) => graphGetImpact(ctx, input),
    }),
    graph_list_exceptions: tool({
      description: "List current exception cards for the org.",
      parameters: graphListExceptionsSchema,
      execute: async () => graphListExceptions(ctx),
    }),
    inventory_promise_query: tool({
      description:
        "Can we promise qty of an SKU by a date? Returns yes / yes_if / no with blockers.",
      parameters: inventoryPromiseQuerySchema,
      execute: async (input) =>
        inventoryPromiseQueryTool(ctx, {
          skuKey: input.skuKey,
          qty: input.qty,
          ...(input.promiseDate !== undefined
            ? { promiseDate: input.promiseDate }
            : {}),
        }),
    }),
    inventory_check_stock: tool({
      description: "Read on_hand / reserved / available for an SKU.",
      parameters: inventoryCheckStockSchema,
      execute: async (input) => inventoryCheckStock(ctx, input),
    }),
    sales_get_order_book: tool({
      description: "List sales orders, optionally filtered by status.",
      parameters: salesGetOrderBookSchema,
      execute: async (input) =>
        salesGetOrderBook(ctx, {
          ...(input.status !== undefined ? { status: input.status } : {}),
        }),
    }),
    sales_generate_quote: tool({
      description: "Draft a quote (line items + GST) without writing the graph.",
      parameters: salesGenerateQuoteSchema,
      execute: async (input) =>
        salesGenerateQuote(ctx, {
          skuKey: input.skuKey,
          qty: input.qty,
          ...(input.customerOrgKey !== undefined
            ? { customerOrgKey: input.customerOrgKey }
            : {}),
        }),
    }),
    sales_accept_order: tool({
      description:
        "Accept an order: promise query, create SalesOrder, reserve stock.",
      parameters: salesAcceptOrderSchema,
      execute: async (input) => salesAcceptOrder(ctx, input),
    }),
    sales_reject_order: tool({
      description: "Cancel a sales order and release reserved stock.",
      parameters: salesRejectOrderSchema,
      execute: async (input) => salesRejectOrder(ctx, input),
    }),
    money_create_payment_link: tool({
      description:
        "Create a Razorpay payment link for an invoice. Policy may require approval.",
      parameters: moneyCreatePaymentLinkSchema,
      execute: async (input) => moneyCreatePaymentLink(ctx, input),
    }),
    money_list_overdue_invoices: tool({
      description: "List overdue invoices from graph exceptions.",
      parameters: moneyListOverdueInvoicesSchema,
      execute: async (input) => moneyListOverdueInvoices(ctx, input),
    }),
    money_propose_collection: tool({
      description: "Propose a Payment Link collection for one overdue invoice.",
      parameters: moneyProposeCollectionSchema,
      execute: async (input) => moneyProposeCollection(ctx, input),
    }),
    money_run_collections_loop: tool({
      description:
        "Run the full collections tick over overdue invoices with nudge stopping rules.",
      parameters: moneyRunCollectionsLoopSchema,
      execute: async (input) => moneyRunCollectionsLoop(ctx, input),
    }),
    money_classify_failure: tool({
      description: "Classify a payment failure (expired / failed / cancelled).",
      parameters: moneyClassifyFailureSchema,
      execute: async (input) =>
        moneyClassifyFailure(ctx, {
          paymentKey: input.paymentKey,
          explanation: input.explanation,
          ...(input.webhookEvent !== undefined
            ? { webhookEvent: input.webhookEvent }
            : {}),
        }),
    }),
    money_impact_query: tool({
      description:
        "Return graph-backed FailureImpact + human why copy for a payment.",
      parameters: moneyImpactQuerySchema,
      execute: async (input) => moneyImpactQuery(ctx, input),
    }),
    money_propose_recovery: tool({
      description:
        "Create money.recovery approval cards (retry / hold / release) for a failed payment.",
      parameters: moneyProposeRecoverySchema,
      execute: async (input) => moneyProposeRecovery(ctx, input),
    }),
    money_propose_payout: tool({
      description: "Propose a vendor payout (pay.vendor policy path).",
      parameters: moneyProposePayoutSchema,
      execute: async (input) => moneyProposePayout(ctx, input),
    }),
    money_get_ledger: tool({
      description: "Return ledger summary: payments in and payouts out.",
      parameters: moneyGetLedgerSchema,
      execute: async (input) => moneyGetLedger(ctx, input),
    }),
    sourcing_explain_need: tool({
      description:
        "Explain material need from graph (reorder, SO demand, late POs).",
      parameters: sourcingExplainNeedSchema,
      execute: async (input) =>
        sourcingExplainNeed(ctx, {
          materialKey: input.materialKey,
          explanation: input.explanation,
          ...(input.triggerSalesOrderKey !== undefined
            ? { triggerSalesOrderKey: input.triggerSalesOrderKey }
            : {}),
        }),
    }),
    sourcing_search_vendors: tool({
      description:
        "Shortlist vendors for a material from the seeded directory.",
      parameters: sourcingSearchVendorsSchema,
      execute: async (input) =>
        sourcingSearchVendorsTool(ctx, {
          materialKey: input.materialKey,
          explanation: input.explanation,
          ...(input.maxResults !== undefined
            ? { maxResults: input.maxResults }
            : {}),
          ...(input.preferVerified !== undefined
            ? { preferVerified: input.preferVerified }
            : {}),
        }),
    }),
    sourcing_browse_public: tool({
      description:
        "Browse a public vendor URL (allowlisted). Falls back to directory if browser disabled.",
      parameters: sourcingBrowsePublicSchema,
      execute: async (input) => sourcingBrowsePublic(ctx, input),
    }),
    sourcing_draft_po: tool({
      description:
        "Draft a purchase order for a vendor+material; creates an approval card.",
      parameters: sourcingDraftPoSchema,
      execute: async (input) =>
        sourcingDraftPo(ctx, {
          vendorOrgKey: input.vendorOrgKey,
          materialKey: input.materialKey,
          qtyKg: input.qtyKg,
          explanation: input.explanation,
          ...(input.reasonSalesOrderKeys !== undefined
            ? { reasonSalesOrderKeys: input.reasonSalesOrderKeys }
            : {}),
          ...(input.expectedAtDays !== undefined
            ? { expectedAtDays: input.expectedAtDays }
            : {}),
        }),
    }),
    comms_draft_email: tool({
      description:
        "Draft a vendor chase email about a PO; writes a Message draft node.",
      parameters: commsDraftEmailSchema,
      execute: async (input) =>
        commsDraftEmail(ctx, {
          aboutNodeKey: input.aboutNodeKey,
          recipientOrgKey: input.recipientOrgKey,
          explanation: input.explanation,
          ...(input.tone !== undefined ? { tone: input.tone } : {}),
        }),
    }),
    calendar_meeting_brief: tool({
      description:
        "Build a meeting prep brief from graph facts (PO delay, demand, last contact).",
      parameters: calendarMeetingBriefSchema,
      execute: async (input) => calendarMeetingBrief(ctx, input),
    }),
    listings_draft_copy: tool({
      description:
        "Draft Instagram/catalog listing copy for an SKU; updates Listing draft_* props.",
      parameters: listingsDraftCopySchema,
      execute: async (input) => listingsDraftCopy(ctx, input),
    }),
    memory_search: tool({
      description:
        "Look up past decisions, preferences, and approval overrides from organizational memory.",
      parameters: memorySearchSchema,
      execute: async (input) =>
        memorySearch(ctx, {
          explanation: input.explanation,
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.subject !== undefined ? { subject: input.subject } : {}),
        }),
    }),
    memory_record: tool({
      description:
        "Save a new organizational preference or decision to memory for future turns.",
      parameters: memoryRecordSchema,
      execute: async (input) => memoryRecord(ctx, input),
    }),
    create_customer: tool({
      description:
        "Create a customer Org node (role=customer) and link it to the merchant.",
      parameters: createCustomerSchema,
      execute: async (input) =>
        createCustomer(ctx, {
          name: input.name,
          explanation: input.explanation,
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        }),
    }),
    create_vendor: tool({
      description:
        "Create a vendor Org node (role=vendor), optionally linking SUPPLIES edges to materials.",
      parameters: createVendorSchema,
      execute: async (input) =>
        createVendor(ctx, {
          name: input.name,
          explanation: input.explanation,
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.verified_bank !== undefined
            ? { verified_bank: input.verified_bank }
            : {}),
          ...(input.materials !== undefined
            ? { materials: input.materials }
            : {}),
        }),
    }),
    create_invoice: tool({
      description:
        "Create an Invoice (status=sent), bill a customer, and optionally link a sales order.",
      parameters: createInvoiceSchema,
      execute: async (input) =>
        createInvoice(ctx, {
          invoiceNumber: input.invoiceNumber,
          customerOrgKey: input.customerOrgKey,
          amountInPaise: input.amountInPaise,
          explanation: input.explanation,
          ...(input.dueInDays !== undefined
            ? { dueInDays: input.dueInDays }
            : {}),
          ...(input.items !== undefined ? { items: input.items } : {}),
          ...(input.salesOrderKey !== undefined
            ? { salesOrderKey: input.salesOrderKey }
            : {}),
        }),
    }),
    create_sku: tool({
      description:
        "Create a SKU with Workshop stock (on_hand=0), optional MADE_FROM materials.",
      parameters: createSkuSchema,
      execute: async (input) =>
        createSku(ctx, {
          name: input.name,
          priceInPaise: input.priceInPaise,
          explanation: input.explanation,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.gst !== undefined ? { gst: input.gst } : {}),
          ...(input.lead_days !== undefined
            ? { lead_days: input.lead_days }
            : {}),
          ...(input.materialKeys !== undefined
            ? { materialKeys: input.materialKeys }
            : {}),
        }),
    }),
    create_material: tool({
      description: "Create a raw Material node (uom, optional reorder_point).",
      parameters: createMaterialSchema,
      execute: async (input) =>
        createMaterial(ctx, {
          name: input.name,
          explanation: input.explanation,
          ...(input.uom !== undefined ? { uom: input.uom } : {}),
          ...(input.reorder_point !== undefined
            ? { reorder_point: input.reorder_point }
            : {}),
        }),
    }),
    create_lead: tool({
      description:
        "Create a Lead from a channel (instagram/whatsapp/etc.), optionally interested in a SKU.",
      parameters: createLeadSchema,
      execute: async (input) =>
        createLead(ctx, {
          name: input.name,
          channel: input.channel,
          explanation: input.explanation,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.skuInterest !== undefined
            ? { skuInterest: input.skuInterest }
            : {}),
        }),
    }),
    create_sales_order: tool({
      description:
        "Create a SalesOrder (auto SO number), link customer+SKU, reserve stock when available.",
      parameters: createSalesOrderSchema,
      execute: async (input) =>
        createSalesOrder(ctx, {
          customerOrgKey: input.customerOrgKey,
          skuKey: input.skuKey,
          qty: input.qty,
          explanation: input.explanation,
          ...(input.promiseDays !== undefined
            ? { promiseDays: input.promiseDays }
            : {}),
          ...(input.channel !== undefined ? { channel: input.channel } : {}),
        }),
    }),
    record_payment: tool({
      description:
        "Record a Payment against an invoice; marks invoice paid when amount matches.",
      parameters: recordPaymentSchema,
      execute: async (input) =>
        recordPayment(ctx, {
          invoiceKey: input.invoiceKey,
          amountInPaise: input.amountInPaise,
          method: input.method,
          explanation: input.explanation,
          ...(input.reference !== undefined
            ? { reference: input.reference }
            : {}),
        }),
    }),
    create_meeting: tool({
      description:
        "Schedule a Meeting node, optionally linked to an attendee org.",
      parameters: createMeetingSchema,
      execute: async (input) =>
        createMeeting(ctx, {
          title: input.title,
          startsAt: input.startsAt,
          explanation: input.explanation,
          ...(input.attendeeOrgKey !== undefined
            ? { attendeeOrgKey: input.attendeeOrgKey }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        }),
    }),
    update_node: tool({
      description:
        "Update properties on any existing graph node by key (merge updates).",
      parameters: updateNodeSchema,
      execute: async (input) => updateNode(ctx, input),
    }),
  };
}
