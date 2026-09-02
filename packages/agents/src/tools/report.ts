import type {
  EdgeRecord,
  Exception,
  GraphStore,
  NodeRecord,
} from "@karya/graph";

export type TableContent = {
  columns: string[];
  rows: string[][];
};

export type MetricContent = {
  label: string;
  value: string;
  trend?: string;
  detail?: string;
};

export type ReportSection = {
  heading: string;
  kind: "markdown" | "table" | "metric";
  content: string | TableContent | MetricContent;
};

export type ReportSpec = {
  title: string;
  generatedAt: string;
  sections: ReportSection[];
};

export type ReportTemplate =
  | "cash_flow_forecast"
  | "collections_priority"
  | "inventory_health"
  | "sales_pipeline"
  | "vendor_performance";

export type AgentKpi = {
  label: string;
  value: string;
  trend?: string;
  why?: string;
  nodeKey?: string;
};

const DAY_MS = 86_400_000;
const DEFAULT_MATERIAL_PRICE_PER_UNIT = 40_500;

function propNumber(props: NodeRecord["props"], key: string): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function propString(props: NodeRecord["props"], key: string): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

/** Exact ₹ with Indian grouping (e.g. ₹1,48,000). */
export function formatInrPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function isPaidInvoice(status: string | null): boolean {
  return status === "paid" || status === "captured" || status === "void";
}

function isOverdueInvoice(node: NodeRecord, now: Date): boolean {
  if (node.type !== "Invoice") return false;
  const status = propString(node.props, "status");
  if (isPaidInvoice(status)) return false;
  if (status === "overdue") return true;
  const dueAt = propString(node.props, "dueAt");
  if (!dueAt) return false;
  const d = new Date(dueAt);
  return !Number.isNaN(d.getTime()) && d < now;
}

function isPendingInvoice(node: NodeRecord, now: Date): boolean {
  if (node.type !== "Invoice") return false;
  const status = propString(node.props, "status");
  if (isPaidInvoice(status) || isOverdueInvoice(node, now)) return false;
  return status === "sent" || status === "open" || status === "issued";
}

function isOpenPo(node: NodeRecord): boolean {
  if (node.type !== "PurchaseOrder") return false;
  const status = propString(node.props, "status");
  return status !== "received" && status !== "cancelled" && status !== "paid";
}

function isLatePo(node: NodeRecord, now: Date): boolean {
  if (!isOpenPo(node)) return false;
  const status = propString(node.props, "status");
  if (status === "late") return true;
  const expectedAt = propString(node.props, "expectedAt");
  if (!expectedAt) return false;
  const d = new Date(expectedAt);
  return !Number.isNaN(d.getTime()) && d < now;
}

function fulfilledSalesStatus(status: string | null): boolean {
  return (
    status === "shipped" ||
    status === "delivered" ||
    status === "paid" ||
    status === "cancelled"
  );
}

function openSalesStatus(status: string | null): boolean {
  return (
    status === "open" ||
    status === "promised" ||
    status === "reserved" ||
    status === "packing"
  );
}

async function loadGraph(store: GraphStore, orgId: string) {
  const [nodes, edges, exceptions] = await Promise.all([
    store.listNodes(orgId),
    store.listEdges(orgId),
    store.exceptions(orgId),
  ]);
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return { nodes, edges, exceptions, byId, byKey };
}

function invoiceAmount(inv: NodeRecord): number {
  return propNumber(inv.props, "amountInPaise");
}

function poAmount(
  po: NodeRecord,
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
): number {
  const explicit = propNumber(po.props, "amountInPaise");
  if (explicit > 0) return explicit;
  const qty = propNumber(po.props, "qty");
  if (qty > 0) return Math.round(qty * DEFAULT_MATERIAL_PRICE_PER_UNIT);
  const line = edges.find(
    (e) => e.type === "ORDER_CONTAINS" && e.fromId === po._id,
  );
  if (line) {
    const lineQty = propNumber(line.props, "qty");
    return Math.round(lineQty * DEFAULT_MATERIAL_PRICE_PER_UNIT);
  }
  void byId;
  return 0;
}

function salesOrderValue(
  so: NodeRecord,
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
): number {
  const explicit = propNumber(so.props, "amountInPaise");
  if (explicit > 0) return explicit;

  const invoiceEdge = edges.find(
    (e) => e.type === "INVOICES" && e.toId === so._id,
  );
  if (invoiceEdge) {
    const inv = byId.get(invoiceEdge.fromId);
    if (inv) return invoiceAmount(inv);
  }

  let total = 0;
  for (const e of edges) {
    if (e.type !== "ORDER_CONTAINS" || e.fromId !== so._id) continue;
    const sku = byId.get(e.toId);
    if (!sku || sku.type !== "SKU") continue;
    const qty = propNumber(e.props, "qty") || propNumber(so.props, "qty") || 1;
    total += propNumber(sku.props, "priceInPaise") * qty;
  }
  return total;
}

function customerForInvoice(
  inv: NodeRecord,
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
): NodeRecord | null {
  const invEdge = edges.find(
    (e) => e.type === "INVOICES" && e.fromId === inv._id,
  );
  if (!invEdge) return null;
  const so = byId.get(invEdge.toId);
  if (!so) return null;
  const buys = edges.find((e) => e.type === "BUYS" && e.toId === so._id);
  if (!buys) return null;
  return byId.get(buys.fromId) ?? null;
}

function vendorForPo(
  po: NodeRecord,
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
): NodeRecord | null {
  const contact = edges.find(
    (e) => e.type === "CONTACT_AT" && e.toId === po._id,
  );
  if (contact) {
    const org = byId.get(contact.fromId);
    if (org?.type === "Org") return org;
  }
  const supplies = edges.find(
    (e) => e.type === "SUPPLIES" && e.toId === po._id,
  );
  if (supplies) return byId.get(supplies.fromId) ?? null;

  // Fall back: material on PO → SUPPLIES vendor
  const contains = edges.find(
    (e) => e.type === "ORDER_CONTAINS" && e.fromId === po._id,
  );
  if (contains) {
    const material = byId.get(contains.toId);
    if (material) {
      const vendorEdge = edges.find(
        (e) =>
          e.type === "SUPPLIES" &&
          e.toId === material._id &&
          byId.get(e.fromId)?.type === "Org",
      );
      if (vendorEdge) return byId.get(vendorEdge.fromId) ?? null;
    }
  }
  return null;
}

function cashFlowForecast(
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  now: Date,
): ReportSpec {
  const invoices = nodes.filter((n) => n.type === "Invoice");
  const pos = nodes.filter((n) => n.type === "PurchaseOrder");

  const paid = invoices.filter((n) =>
    isPaidInvoice(propString(n.props, "status")),
  );
  const overdue = invoices.filter((n) => isOverdueInvoice(n, now));
  const pending = invoices.filter((n) => isPendingInvoice(n, now));

  const receivables = [...overdue, ...pending];
  const receivablesTotal = receivables.reduce(
    (s, n) => s + invoiceAmount(n),
    0,
  );

  const openPos = pos.filter(isOpenPo);
  const payablesTotal = openPos.reduce(
    (s, n) => s + poAmount(n, edges, byId),
    0,
  );
  const net = receivablesTotal - payablesTotal;

  const receivableRows = receivables.map((inv) => {
    const customer = customerForInvoice(inv, edges, byId);
    const status = propString(inv.props, "status") ?? "—";
    const dueAt = propString(inv.props, "dueAt");
    return [
      inv.key,
      customer?.label ?? "—",
      formatInrPaise(invoiceAmount(inv)),
      status,
      dueAt ? dueAt.slice(0, 10) : "—",
    ];
  });

  const payableRows = openPos.map((po) => {
    const vendor = vendorForPo(po, edges, byId);
    return [
      po.key,
      vendor?.label ?? "—",
      formatInrPaise(poAmount(po, edges, byId)),
      propString(po.props, "status") ?? "—",
      propString(po.props, "expectedAt")?.slice(0, 10) ?? "—",
    ];
  });

  // 30-day weekly buckets: week 1–4 from now
  const weeks: Array<{ label: string; inPaise: number; outPaise: number }> = [];
  for (let w = 0; w < 4; w++) {
    const start = new Date(now.getTime() + w * 7 * DAY_MS);
    const end = new Date(now.getTime() + (w + 1) * 7 * DAY_MS);
    let inPaise = 0;
    let outPaise = 0;
    for (const inv of receivables) {
      const dueAt = propString(inv.props, "dueAt");
      const due = dueAt ? new Date(dueAt) : now;
      // Overdue → week 1; future dues by date
      const bucketDate = isOverdueInvoice(inv, now) ? now : due;
      if (bucketDate >= start && bucketDate < end) {
        inPaise += invoiceAmount(inv);
      }
    }
    for (const po of openPos) {
      const expectedAt = propString(po.props, "expectedAt");
      const expected = expectedAt ? new Date(expectedAt) : now;
      const bucketDate = isLatePo(po, now) ? now : expected;
      if (bucketDate >= start && bucketDate < end) {
        outPaise += poAmount(po, edges, byId);
      }
    }
    weeks.push({
      label: `Week ${w + 1} (${start.toISOString().slice(0, 10)})`,
      inPaise,
      outPaise,
    });
  }

  const forecastLines = weeks.map(
    (w) =>
      `- **${w.label}:** in ${formatInrPaise(w.inPaise)}, out ${formatInrPaise(w.outPaise)}, net ${formatInrPaise(w.inPaise - w.outPaise)}`,
  );

  return {
    title: "Cash Flow Forecast",
    generatedAt: now.toISOString(),
    sections: [
      {
        heading: "Net cash position",
        kind: "metric",
        content: {
          label: "Net position (receivables − payables)",
          value: formatInrPaise(net),
          trend: net >= 0 ? "up" : "down",
          detail: `Receivables ${formatInrPaise(receivablesTotal)} · Payables ${formatInrPaise(payablesTotal)} · Paid invoices ${paid.length}`,
        },
      },
      {
        heading: "Receivables",
        kind: "table",
        content: {
          columns: ["Invoice", "Customer", "Amount", "Status", "Due"],
          rows: receivableRows,
        },
      },
      {
        heading: "Payables",
        kind: "table",
        content: {
          columns: ["PO", "Vendor", "Amount", "Status", "Expected"],
          rows: payableRows,
        },
      },
      {
        heading: "30-day weekly projection",
        kind: "markdown",
        content: [
          "Projected collections and outflows over the next 30 days (weekly buckets).",
          "",
          ...forecastLines,
        ].join("\n"),
      },
    ],
  };
}

function collectionsPriority(
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  now: Date,
): ReportSpec {
  const overdue = nodes
    .filter((n) => isOverdueInvoice(n, now))
    .map((inv) => {
      const amount = invoiceAmount(inv);
      const dueAt = propString(inv.props, "dueAt") ?? now.toISOString();
      const days = daysBetween(dueAt, now) || 1;
      const risk = amount * days;
      const customer = customerForInvoice(inv, edges, byId);
      return { inv, amount, days, risk, customer };
    })
    .sort((a, b) => b.risk - a.risk);

  const totalOverdue = overdue.reduce((s, r) => s + r.amount, 0);

  return {
    title: "Collections Priority",
    generatedAt: now.toISOString(),
    sections: [
      {
        heading: "Total overdue",
        kind: "metric",
        content: {
          label: "Overdue receivables",
          value: formatInrPaise(totalOverdue),
          trend: overdue.length > 0 ? "down" : "stable",
          detail: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`,
        },
      },
      {
        heading: "Priority queue",
        kind: "table",
        content: {
          columns: [
            "Rank",
            "Invoice",
            "Customer",
            "Amount",
            "Days overdue",
            "Risk score",
            "Status",
          ],
          rows: overdue.map((r, i) => [
            String(i + 1),
            r.inv.key,
            r.customer?.label ?? "—",
            formatInrPaise(r.amount),
            String(r.days),
            String(r.risk),
            propString(r.inv.props, "status") ?? "overdue",
          ]),
        },
      },
    ],
  };
}

function inventoryHealth(
  nodes: NodeRecord[],
  exceptions: Exception[],
  now: Date,
): ReportSpec {
  const stocks = nodes.filter((n) => n.type === "Stock");
  const promiseRiskKeys = new Set(
    exceptions
      .filter((e) => e.code === "stock.promise_risk")
      .map((e) => e.nodeKey)
      .filter((k): k is string => Boolean(k)),
  );

  type StockRow = {
    stock: NodeRecord;
    onHand: number;
    reserved: number;
    available: number;
    atRisk: boolean;
    reason: string;
  };

  const rows: StockRow[] = stocks.map((stock) => {
    const onHand = propNumber(stock.props, "on_hand");
    const reserved = propNumber(stock.props, "reserved");
    const available = onHand - reserved;
    const lowPct = onHand > 0 && available < onHand * 0.2;
    const promiseRisk =
      promiseRiskKeys.has(stock.key) ||
      [...promiseRiskKeys].some((k) => stock.key.includes(k.replace("SKU:", "")));
    // Also flag if any promise_risk exception references related SKU in title/detail
    const linkedRisk = exceptions.some(
      (e) =>
        e.code === "stock.promise_risk" &&
        (e.nodeKey?.includes(stock.key.split("@")[0]?.replace("Stock:", "") ?? "") ||
          e.detail.includes(stock.label) ||
          e.title.includes(stock.label.split(" @")[0] ?? "")),
    );
    const atRisk = lowPct || promiseRisk || linkedRisk;
    let reason = "ok";
    if (linkedRisk || promiseRisk) reason = "promise risk";
    else if (lowPct) reason = "below 20% available";
    return { stock, onHand, reserved, available, atRisk, reason };
  });

  const atRisk = rows.filter((r) => r.atRisk);

  return {
    title: "Inventory Health",
    generatedAt: now.toISOString(),
    sections: [
      {
        heading: "Stock overview",
        kind: "metric",
        content: {
          label: "SKUs tracked",
          value: String(stocks.length),
          trend: atRisk.length > 0 ? "down" : "stable",
          detail: `${atRisk.length} at risk`,
        },
      },
      {
        heading: "Stock levels",
        kind: "table",
        content: {
          columns: [
            "Stock",
            "On hand",
            "Reserved",
            "Available",
            "Status",
          ],
          rows: rows.map((r) => [
            r.stock.key,
            String(r.onHand),
            String(r.reserved),
            String(r.available),
            r.atRisk ? r.reason : "healthy",
          ]),
        },
      },
      {
        heading: "Reorder recommendations",
        kind: "markdown",
        content:
          atRisk.length === 0
            ? "All tracked stock positions are within healthy available bands."
            : atRisk
                .map(
                  (r) =>
                    `- **${r.stock.key}**: available ${r.available} of ${r.onHand} on hand (${r.reason}). Consider reorder or releasing holds.`,
                )
                .join("\n"),
      },
    ],
  };
}

function salesPipeline(
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  exceptions: Exception[],
  now: Date,
): ReportSpec {
  const orders = nodes.filter((n) => n.type === "SalesOrder");
  const byStatus = new Map<string, NodeRecord[]>();
  for (const so of orders) {
    const status = propString(so.props, "status") ?? "unknown";
    const list = byStatus.get(status) ?? [];
    list.push(so);
    byStatus.set(status, list);
  }

  const openOrders = orders.filter((so) =>
    openSalesStatus(propString(so.props, "status")),
  );
  const pipelineValue = openOrders.reduce(
    (s, so) => s + salesOrderValue(so, edges, byId),
    0,
  );
  const fulfilled = orders.filter((so) =>
    fulfilledSalesStatus(propString(so.props, "status")),
  );
  const fulfilledPct =
    orders.length === 0
      ? 0
      : Math.round((fulfilled.length / orders.length) * 100);

  const riskKeys = new Set(
    exceptions
      .filter(
        (e) =>
          e.code === "stock.promise_risk" ||
          e.domain === "sales" ||
          e.nodeKey?.startsWith("SalesOrder:"),
      )
      .map((e) => e.nodeKey)
      .filter((k): k is string => Boolean(k)),
  );

  const atRiskOrders = openOrders.filter((so) => {
    if (riskKeys.has(so.key)) return true;
    // Linked late PO via ABOUT
    return edges.some((e) => {
      if (e.type !== "ABOUT") return false;
      if (e.fromId !== so._id && e.toId !== so._id) return false;
      const otherId = e.fromId === so._id ? e.toId : e.fromId;
      const other = byId.get(otherId);
      return other ? isLatePo(other, now) : false;
    });
  });

  const statusRows = [...byStatus.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, list]) => {
      const value = list.reduce(
        (s, so) => s + salesOrderValue(so, edges, byId),
        0,
      );
      return [status, String(list.length), formatInrPaise(value)];
    });

  return {
    title: "Sales Pipeline",
    generatedAt: now.toISOString(),
    sections: [
      {
        heading: "Pipeline value",
        kind: "metric",
        content: {
          label: "Open pipeline",
          value: formatInrPaise(pipelineValue),
          trend: atRiskOrders.length > 0 ? "down" : "up",
          detail: `${openOrders.length} open · ${fulfilledPct}% fulfilled/closed`,
        },
      },
      {
        heading: "Status breakdown",
        kind: "table",
        content: {
          columns: ["Status", "Orders", "Value"],
          rows: statusRows,
        },
      },
      {
        heading: "At-risk orders",
        kind: "table",
        content: {
          columns: ["Order", "Status", "Value", "Promise"],
          rows: atRiskOrders.map((so) => [
            so.key,
            propString(so.props, "status") ?? "—",
            formatInrPaise(salesOrderValue(so, edges, byId)),
            propString(so.props, "promise_date") ??
              propString(so.props, "promiseDate") ??
              "—",
          ]),
        },
      },
    ],
  };
}

function vendorPerformance(
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  now: Date,
): ReportSpec {
  const pos = nodes.filter((n) => n.type === "PurchaseOrder");
  const vendors = nodes.filter(
    (n) => n.type === "Org" && propString(n.props, "role") === "vendor",
  );

  type Score = {
    vendor: NodeRecord;
    poCount: number;
    lateCount: number;
    totalValue: number;
  };

  const scores = new Map<string, Score>();

  for (const vendor of vendors) {
    scores.set(vendor._id, {
      vendor,
      poCount: 0,
      lateCount: 0,
      totalValue: 0,
    });
  }

  for (const po of pos) {
    const vendor = vendorForPo(po, edges, byId);
    if (!vendor) continue;
    const score = scores.get(vendor._id) ?? {
      vendor,
      poCount: 0,
      lateCount: 0,
      totalValue: 0,
    };
    score.poCount += 1;
    if (isLatePo(po, now)) score.lateCount += 1;
    score.totalValue += poAmount(po, edges, byId);
    scores.set(vendor._id, score);
  }

  // Also count delayed shipments linked to POs
  const delayedShipments = nodes.filter(
    (n) =>
      n.type === "Shipment" &&
      (propString(n.props, "status") === "delayed" ||
        propNumber(n.props, "delay_days") > 0),
  );

  const activeVendors = [...scores.values()].filter((s) => s.poCount > 0);

  const scorecard = [...scores.values()]
    .filter((s) => s.poCount > 0)
    .sort((a, b) => b.poCount - a.poCount)
    .map((s) => {
      const onTimePct =
        s.poCount === 0
          ? 100
          : Math.round(((s.poCount - s.lateCount) / s.poCount) * 100);
      const avg =
        s.poCount === 0 ? 0 : Math.round(s.totalValue / s.poCount);
      return [
        s.vendor.label,
        String(s.poCount),
        `${onTimePct}%`,
        formatInrPaise(avg),
      ];
    });

  return {
    title: "Vendor Performance",
    generatedAt: now.toISOString(),
    sections: [
      {
        heading: "Active vendors",
        kind: "metric",
        content: {
          label: "Vendors with POs",
          value: String(activeVendors.length),
          trend: delayedShipments.length > 0 ? "down" : "stable",
          detail: `${pos.length} POs · ${delayedShipments.length} delayed shipment${delayedShipments.length === 1 ? "" : "s"}`,
        },
      },
      {
        heading: "Vendor scorecard",
        kind: "table",
        content: {
          columns: ["Vendor", "PO count", "On-time %", "Avg value"],
          rows: scorecard,
        },
      },
    ],
  };
}

export async function generateReport(
  store: GraphStore,
  orgId: string,
  input: { template: ReportTemplate; params?: Record<string, string> },
): Promise<ReportSpec> {
  const now = new Date();
  const { nodes, edges, exceptions, byId } = await loadGraph(store, orgId);
  void input.params;

  switch (input.template) {
    case "cash_flow_forecast":
      return cashFlowForecast(nodes, edges, byId, now);
    case "collections_priority":
      return collectionsPriority(nodes, edges, byId, now);
    case "inventory_health":
      return inventoryHealth(nodes, exceptions, now);
    case "sales_pipeline":
      return salesPipeline(nodes, edges, byId, exceptions, now);
    case "vendor_performance":
      return vendorPerformance(nodes, edges, byId, now);
    default: {
      const _exhaustive: never = input.template;
      throw new Error(`Unknown report template: ${String(_exhaustive)}`);
    }
  }
}

export async function computeAgentKpis(
  store: GraphStore,
  orgId: string,
): Promise<{ kpis: AgentKpi[]; generatedAt: string }> {
  const now = new Date();
  const { nodes, edges, exceptions, byId } = await loadGraph(store, orgId);

  const invoices = nodes.filter((n) => n.type === "Invoice");
  const outstanding = invoices.filter((n) => {
    const status = propString(n.props, "status");
    return !isPaidInvoice(status);
  });
  const receivablesTotal = outstanding.reduce(
    (s, n) => s + invoiceAmount(n),
    0,
  );
  const overdue = outstanding.filter((n) => isOverdueInvoice(n, now));
  const overdueTotal = overdue.reduce((s, n) => s + invoiceAmount(n), 0);

  const openPos = nodes.filter(
    (n) => n.type === "PurchaseOrder" && isOpenPo(n),
  );
  const payablesTotal = openPos.reduce(
    (s, n) => s + poAmount(n, edges, byId),
    0,
  );
  const vendorIds = new Set(
    openPos
      .map((po) => vendorForPo(po, edges, byId)?._id)
      .filter((id): id is string => Boolean(id)),
  );

  const activeOrders = nodes.filter(
    (n) =>
      n.type === "SalesOrder" &&
      openSalesStatus(propString(n.props, "status")),
  );

  const stockAlerts = exceptions.filter(
    (e) => e.code === "stock.promise_risk",
  ).length;

  const stockAlertEx = exceptions.find((e) => e.code === "stock.promise_risk");

  const kpis: AgentKpi[] = [
    {
      label: "Total Receivables",
      value: formatInrPaise(receivablesTotal),
      trend: overdue.length > 0 ? "down" : "stable",
      why: `${formatInrPaise(overdueTotal)} from ${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`,
      ...(overdue[0]?.key ? { nodeKey: overdue[0].key } : {}),
    },
    {
      label: "Total Payables",
      value: formatInrPaise(payablesTotal),
      trend: openPos.some((p) => isLatePo(p, now)) ? "down" : "stable",
      why: `${openPos.length} PO${openPos.length === 1 ? "" : "s"} pending from ${vendorIds.size} vendor${vendorIds.size === 1 ? "" : "s"}`,
      ...(openPos[0]?.key ? { nodeKey: openPos[0].key } : {}),
    },
    {
      label: "Active Orders",
      value: String(activeOrders.length),
      trend: "stable",
      why: `${activeOrders.length} non-fulfilled sales order${activeOrders.length === 1 ? "" : "s"}`,
      ...(activeOrders[0]?.key ? { nodeKey: activeOrders[0].key } : {}),
    },
    {
      label: "Stock Alerts",
      value: String(stockAlerts),
      trend: stockAlerts > 0 ? "down" : "up",
      why:
        stockAlerts === 0
          ? "No SKUs with promise risk"
          : `${stockAlerts} SKU${stockAlerts === 1 ? "" : "s"} with promise risk`,
      ...(stockAlertEx?.nodeKey ? { nodeKey: stockAlertEx.nodeKey } : {}),
    },
    {
      label: "Collections Risk",
      value: `${overdue.length} · ${formatInrPaise(overdueTotal)}`,
      trend: overdue.length > 0 ? "down" : "stable",
      why: `${overdue.length} overdue · ${formatInrPaise(overdueTotal)} at risk`,
      ...(overdue[0]?.key ? { nodeKey: overdue[0].key } : {}),
    },
  ];

  return { kpis, generatedAt: now.toISOString() };
}
