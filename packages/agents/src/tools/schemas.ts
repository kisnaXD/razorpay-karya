import { z } from "zod";

export const explanationField = z
  .string()
  .min(8)
  .describe(
    "One sentence why this tool is being called — shown in audit and UI.",
  );

export const graphNeighborhoodSchema = z.object({
  nodeKey: z.string().min(1),
  depth: z.union([z.literal(1), z.literal(2)]),
  explanation: explanationField,
});

export const graphFindPathSchema = z.object({
  fromKey: z.string().min(1),
  toKey: z.string().min(1),
  explanation: explanationField,
});

export const graphGetImpactSchema = z.object({
  nodeKey: z.string().min(1),
  explanation: explanationField,
});

export const graphListExceptionsSchema = z.object({
  explanation: explanationField,
});

export const queryGraphSchema = z.object({
  action: z.enum([
    "list_nodes",
    "get_node",
    "list_edges",
    "search",
    "neighborhood",
  ]),
  nodeType: z
    .enum([
      "SKU",
      "Material",
      "Stock",
      "SalesOrder",
      "PurchaseOrder",
      "Invoice",
      "Payment",
      "Org",
      "Person",
      "Lead",
      "Listing",
      "Meeting",
      "Message",
      "Task",
      "Shipment",
      "Location",
      "Policy",
      "Document",
      "Event",
    ])
    .optional()
    .describe("For list_nodes: filter to this node type"),
  nodeKey: z
    .string()
    .min(1)
    .optional()
    .describe('For get_node / neighborhood: e.g. "SKU:Diya-Large"'),
  searchTerm: z
    .string()
    .min(1)
    .optional()
    .describe("For search: case-insensitive match on label or key"),
  edgeType: z
    .string()
    .min(1)
    .optional()
    .describe("For list_edges: optional edge type filter"),
  explanation: explanationField,
});

export const listAllDataSchema = z.object({
  explanation: explanationField,
});

export const inventoryPromiseQuerySchema = z.object({
  skuKey: z.string().min(1),
  qty: z.number().int().positive(),
  promiseDate: z.string().optional(),
  explanation: explanationField,
});

export const inventoryCheckStockSchema = z.object({
  skuKey: z.string().min(1),
  explanation: explanationField,
});

export const salesGetOrderBookSchema = z.object({
  status: z
    .enum([
      "open",
      "reserved",
      "promised",
      "packing",
      "shipped",
      "cancelled",
    ])
    .optional(),
  explanation: explanationField,
});

export const salesGenerateQuoteSchema = z.object({
  skuKey: z.string().min(1),
  qty: z.number().int().positive(),
  customerOrgKey: z.string().optional(),
  explanation: explanationField,
});

export const salesAcceptOrderSchema = z.object({
  customerOrgKey: z.string().min(1),
  skuKey: z.string().min(1),
  qty: z.number().int().positive(),
  promiseDate: z.string().min(1),
  explanation: explanationField,
});

export const salesRejectOrderSchema = z.object({
  salesOrderKey: z.string().min(1),
  reason: z.string().min(1),
  explanation: explanationField,
});

export const moneyCreatePaymentLinkSchema = z.object({
  invoiceKey: z.string().min(1),
  explanation: explanationField,
});

export const moneyListOverdueInvoicesSchema = z.object({
  explanation: explanationField,
});

export const moneyProposeCollectionSchema = z.object({
  invoiceKey: z.string().min(1),
  explanation: explanationField,
});

export const moneyRunCollectionsLoopSchema = z.object({
  explanation: explanationField,
});

export const moneyClassifyFailureSchema = z.object({
  paymentKey: z.string().min(1),
  webhookEvent: z.string().optional(),
  explanation: explanationField,
});

export const moneyImpactQuerySchema = z.object({
  paymentKey: z.string().min(1),
  explanation: explanationField,
});

export const moneyProposeRecoverySchema = z.object({
  paymentKey: z.string().min(1),
  explanation: explanationField,
});

export const moneyProposePayoutSchema = z.object({
  vendorOrgKey: z.string().min(1),
  amountInPaise: z.number().int().positive(),
  explanation: explanationField,
});

export const moneyGetLedgerSchema = z.object({
  explanation: explanationField,
});

export const memorySearchSchema = z.object({
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags to filter by, e.g. ['procurement', 'vendor']"),
  subject: z
    .string()
    .optional()
    .describe("Subject to search for, e.g. 'Material:BrassSheet-22g'"),
  explanation: explanationField,
});

export const memoryRecordSchema = z.object({
  kind: z.enum(["preference", "decision"]).describe("Type of memory"),
  subject: z.string().describe("What this memory is about"),
  content: z.string().describe("The memory content in natural language"),
  tags: z.array(z.string()).describe("Tags for retrieval"),
  explanation: explanationField,
});

export const rootCauseAnalysisSchema = z.object({
  question: z
    .string()
    .min(3)
    .describe("Natural language question, e.g. 'Why is margin falling?'"),
  focusNodeKey: z
    .string()
    .optional()
    .describe("Optional anchor node key to focus analysis"),
  explanation: explanationField,
});

export const generateReportSchema = z.object({
  template: z
    .enum([
      "cash_flow_forecast",
      "collections_priority",
      "inventory_health",
      "sales_pipeline",
      "vendor_performance",
    ])
    .describe("Report template to generate"),
  params: z
    .record(z.string())
    .optional()
    .describe("Optional parameters for the report"),
  explanation: explanationField,
});

export const consultAgentsSchema = z.object({
  requests: z
    .array(
      z.object({
        agentId: z.enum(["finance", "procurement", "sales", "operations"]),
        question: z
          .string()
          .min(8)
          .describe("Question for the specialist agent"),
      }),
    )
    .min(1)
    .max(4),
  explanation: explanationField,
});
