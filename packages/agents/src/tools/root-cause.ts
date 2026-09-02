import type {
  EdgeRecord,
  GraphStore,
  NodeRecord,
} from "@karya/graph";

export type RootCauseStep = {
  layer: "finance" | "procurement" | "inventory" | "sales";
  nodeKey: string;
  label: string;
  finding: string;
};

export type RootCauseResult = {
  question: string;
  steps: RootCauseStep[];
  summary: string;
  recommendedActions: Array<{
    label: string;
    toolHint: string;
    nodeKey: string;
  }>;
};

type AnalysisKind = "margin" | "cash" | "delay" | "stockout";

function propNumber(props: NodeRecord["props"], key: string): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function propString(props: NodeRecord["props"], key: string): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function formatInr(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function detectKind(question: string): AnalysisKind | null {
  const q = question.toLowerCase();
  if (/\b(margin|profit|cost)\b/.test(q)) return "margin";
  if (/\b(cash|receivables|money)\b/.test(q)) return "cash";
  if (/\b(delay|late)\b/.test(q)) return "delay";
  if (/\b(stockout|inventory)\b/.test(q) || /low\s+stock/.test(q)) {
    return "stockout";
  }
  return null;
}

function isOverdueInvoice(node: NodeRecord, now: Date): boolean {
  if (node.type !== "Invoice") return false;
  const status = propString(node.props, "status");
  if (status === "paid" || status === "void") return false;
  if (status === "overdue") return true;
  const dueAt = propString(node.props, "dueAt");
  if (!dueAt) return false;
  const d = new Date(dueAt);
  return !Number.isNaN(d.getTime()) && d < now;
}

function isLatePo(node: NodeRecord, now: Date): boolean {
  if (node.type !== "PurchaseOrder") return false;
  const status = propString(node.props, "status");
  if (status === "received" || status === "cancelled") return false;
  if (status === "late") return true;
  const expectedAt = propString(node.props, "expectedAt");
  if (!expectedAt) return false;
  const d = new Date(expectedAt);
  return !Number.isNaN(d.getTime()) && d < now;
}

function openSalesStatuses(status: string | null): boolean {
  return (
    status === "open" ||
    status === "promised" ||
    status === "reserved" ||
    status === "packing"
  );
}

async function loadGraph(store: GraphStore, orgId: string) {
  const [nodes, edges] = await Promise.all([
    store.listNodes(orgId),
    store.listEdges(orgId),
  ]);
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return { nodes, edges, byId, byKey };
}

function analyzeMargin(
  question: string,
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  now: Date,
  focusNodeKey?: string,
): RootCauseResult {
  const steps: RootCauseStep[] = [];
  const actions: RootCauseResult["recommendedActions"] = [];

  let skus = nodes.filter((n) => n.type === "SKU");
  if (focusNodeKey) {
    const focus = nodes.find((n) => n.key === focusNodeKey);
    if (focus?.type === "SKU") {
      skus = [focus];
    } else if (focus?.type === "Material") {
      const skuIds = new Set(
        edges
          .filter((e) => e.type === "MADE_FROM" && e.toId === focus._id)
          .map((e) => e.fromId),
      );
      skus = skus.filter((s) => skuIds.has(s._id));
    }
  }

  const latePos = nodes.filter((n) => isLatePo(n, now));
  const materialCostPressure: Array<{
    sku: NodeRecord;
    material: NodeRecord;
    kgPerUnit: number;
    salePrice: number;
    latePo: NodeRecord | null;
  }> = [];

  for (const sku of skus) {
    const salePrice = propNumber(sku.props, "priceInPaise");
    const madeFrom = edges.filter(
      (e) => e.type === "MADE_FROM" && e.fromId === sku._id,
    );
    for (const mf of madeFrom) {
      const material = byId.get(mf.toId);
      if (!material || material.type !== "Material") continue;
      const kgPerUnit = propNumber(mf.props, "qty");
      const poEdges = edges.filter(
        (e) =>
          e.type === "ORDER_CONTAINS" &&
          e.toId === material._id &&
          byId.get(e.fromId)?.type === "PurchaseOrder",
      );
      let latePo: NodeRecord | null = null;
      let poUnitPaise = 0;
      for (const pe of poEdges) {
        const po = byId.get(pe.fromId);
        if (!po) continue;
        const lineQty = propNumber(pe.props, "qty") || propNumber(po.props, "qty");
        const lineAmount =
          propNumber(pe.props, "amountInPaise") ||
          propNumber(po.props, "amountInPaise");
        if (lineAmount > 0 && lineQty > 0) {
          poUnitPaise = Math.max(poUnitPaise, Math.round(lineAmount / lineQty));
        }
        if (isLatePo(po, now)) {
          latePo = po;
        }
      }
      materialCostPressure.push({
        sku,
        material,
        kgPerUnit,
        salePrice,
        latePo,
      });

      steps.push({
        layer: "sales",
        nodeKey: sku.key,
        label: sku.label,
        finding:
          salePrice > 0
            ? `Sells at ${formatInr(salePrice)}; uses ${kgPerUnit || "?"} ${propString(material.props, "uom") ?? "units"} of ${material.label} per piece.`
            : `No sale price on graph for ${sku.label}.`,
      });

      steps.push({
        layer: "procurement",
        nodeKey: material.key,
        label: material.label,
        finding: latePo
          ? `Inbound supply via ${latePo.key} is late — material cost and availability pressure on ${sku.key}.`
          : poEdges.length > 0
            ? `Linked to ${poEdges.length} open PO line(s)${poUnitPaise > 0 ? ` (~${formatInr(poUnitPaise)}/unit on PO)` : ""}.`
            : "No active PO covering this material — reorder risk.",
      });

      if (latePo) {
        actions.push({
          label: `Chase late ${latePo.label} for ${material.label}`,
          toolHint: "comms_draft_email",
          nodeKey: latePo.key,
        });
        actions.push({
          label: `Shortlist alternate vendor for ${material.label}`,
          toolHint: "sourcing_search_vendors",
          nodeKey: material.key,
        });
      } else if (poEdges.length === 0) {
        actions.push({
          label: `Draft PO for ${material.label}`,
          toolHint: "sourcing_draft_po",
          nodeKey: material.key,
        });
      }
    }
  }

  if (latePos.length > 0 && steps.every((s) => s.layer !== "procurement" || !s.finding.includes("late"))) {
    for (const po of latePos.slice(0, 3)) {
      steps.push({
        layer: "procurement",
        nodeKey: po.key,
        label: po.label,
        finding: `PO status ${propString(po.props, "status") ?? "unknown"} — late inbound spend elevates unit cost risk.`,
      });
    }
  }

  const exposed = materialCostPressure.filter((r) => r.latePo);
  const summary =
    exposed.length > 0
      ? `Margin pressure: ${exposed.length} SKU–material link(s) sit behind late POs (e.g. ${exposed[0]!.sku.key} ← ${exposed[0]!.material.key} ← ${exposed[0]!.latePo!.key}). Review pricing or alternate sourcing.`
      : materialCostPressure.length > 0
        ? `Mapped ${materialCostPressure.length} SKU→material cost links. No late POs in the chain — watch material intensity vs sale price and vendor rates.`
        : "No MADE_FROM cost chain found for the focused SKUs.";

  if (actions.length === 0 && skus[0]) {
    actions.push({
      label: `Review price for ${skus[0].label}`,
      toolHint: "query_graph",
      nodeKey: skus[0].key,
    });
  }

  return {
    question,
    steps,
    summary,
    recommendedActions: dedupeActions(actions).slice(0, 5),
  };
}

function analyzeCash(
  question: string,
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  now: Date,
  focusNodeKey?: string,
): RootCauseResult {
  const steps: RootCauseStep[] = [];
  const actions: RootCauseResult["recommendedActions"] = [];

  let invoices = nodes.filter((n) => n.type === "Invoice");
  if (focusNodeKey) {
    const focus = nodes.find((n) => n.key === focusNodeKey);
    if (focus?.type === "Invoice") {
      invoices = [focus];
    }
  }

  const overdue = invoices.filter((inv) => isOverdueInvoice(inv, now));
  let outstanding = 0;

  for (const inv of overdue) {
    const amount = propNumber(inv.props, "amountInPaise");
    outstanding += amount;
    const payEdge = edges.find(
      (e) => e.type === "PAYS" && e.toId === inv._id,
    );
    const payment = payEdge ? byId.get(payEdge.fromId) : null;
    const payStatus = payment
      ? propString(payment.props, "status")
      : "no_payment";

    steps.push({
      layer: "finance",
      nodeKey: inv.key,
      label: inv.label,
      finding: `${formatInr(amount)} overdue (status=${propString(inv.props, "status") ?? "unknown"}; dueAt=${propString(inv.props, "dueAt") ?? "n/a"}).`,
    });

    if (payment) {
      steps.push({
        layer: "finance",
        nodeKey: payment.key,
        label: payment.label,
        finding: `Linked payment status=${payStatus}${payStatus === "sent" ? " — uncollected link still outstanding" : ""}.`,
      });
    } else {
      steps.push({
        layer: "finance",
        nodeKey: inv.key,
        label: inv.label,
        finding: "No Payment node linked via PAYS — collection link may be missing.",
      });
    }

    const soEdge = edges.find(
      (e) => e.type === "INVOICES" && e.fromId === inv._id,
    );
    const so = soEdge ? byId.get(soEdge.toId) : null;
    if (so) {
      steps.push({
        layer: "sales",
        nodeKey: so.key,
        label: so.label,
        finding: `Receivable tied to ${so.label} (status=${propString(so.props, "status") ?? "unknown"}).`,
      });
    }

    actions.push({
      label: `Collect ${inv.label}`,
      toolHint: "money_propose_collection",
      nodeKey: inv.key,
    });
  }

  if (overdue.length === 0) {
    steps.push({
      layer: "finance",
      nodeKey: "Invoice:*",
      label: "Receivables",
      finding: "No overdue invoices found on the graph.",
    });
  } else {
    actions.push({
      label: "Run collections loop over overdue invoices",
      toolHint: "money_run_collections_loop",
      nodeKey: overdue[0]!.key,
    });
  }

  const summary =
    overdue.length > 0
      ? `Cash gap: ${overdue.length} overdue invoice(s) totaling ${formatInr(outstanding)} outstanding.`
      : "No overdue receivables detected.";

  return {
    question,
    steps,
    summary,
    recommendedActions: dedupeActions(actions).slice(0, 5),
  };
}

function analyzeDelay(
  question: string,
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  byKey: Map<string, NodeRecord>,
  now: Date,
  focusNodeKey?: string,
): RootCauseResult {
  const steps: RootCauseStep[] = [];
  const actions: RootCauseResult["recommendedActions"] = [];

  const latePos = nodes.filter((n) => isLatePo(n, now));
  const delayedShipments = nodes.filter((n) => {
    if (n.type !== "Shipment") return false;
    const status = propString(n.props, "status");
    return status === "delayed";
  });

  let focusPos: NodeRecord[] = [];
  let focusShipments: NodeRecord[] = [];

  if (focusNodeKey) {
    const focus = byKey.get(focusNodeKey);
    if (focus?.type === "PurchaseOrder") {
      focusPos = [focus];
      focusShipments = edges
        .filter((e) => e.type === "FULFILLS" && e.toId === focus._id)
        .map((e) => byId.get(e.fromId))
        .filter((n): n is NodeRecord => !!n && n.type === "Shipment");
    } else if (focus?.type === "Shipment") {
      focusShipments = [focus];
      focusPos = edges
        .filter((e) => e.type === "FULFILLS" && e.fromId === focus._id)
        .map((e) => byId.get(e.toId))
        .filter((n): n is NodeRecord => !!n && n.type === "PurchaseOrder");
    } else if (focus?.type === "SalesOrder") {
      const aboutPos = edges
        .filter((e) => e.type === "ABOUT" && e.fromId === focus._id)
        .map((e) => byId.get(e.toId))
        .filter((n): n is NodeRecord => !!n && n.type === "PurchaseOrder");
      focusPos = aboutPos.length > 0 ? aboutPos : latePos;
      for (const po of focusPos) {
        focusShipments.push(
          ...edges
            .filter((e) => e.type === "FULFILLS" && e.toId === po._id)
            .map((e) => byId.get(e.fromId))
            .filter((n): n is NodeRecord => !!n && n.type === "Shipment"),
        );
      }
      steps.push({
        layer: "sales",
        nodeKey: focus.key,
        label: focus.label,
        finding: `Promise ${propString(focus.props, "promise_date") ?? "n/a"}; status=${propString(focus.props, "status") ?? "unknown"}.`,
      });
    }
  }

  if (focusPos.length === 0) {
    focusPos = latePos.length > 0 ? latePos : nodes.filter((n) => n.type === "PurchaseOrder");
  }
  if (focusShipments.length === 0) {
    focusShipments = delayedShipments;
  }

  const affectedSoKeys = new Set<string>();

  for (const ship of focusShipments.slice(0, 5)) {
    steps.push({
      layer: "procurement",
      nodeKey: ship.key,
      label: ship.label,
      finding: `Shipment status=${propString(ship.props, "status") ?? "unknown"}${propNumber(ship.props, "delay_days") ? ` (${propNumber(ship.props, "delay_days")}d delay)` : ""}.`,
    });
  }

  for (const po of focusPos.slice(0, 5)) {
    steps.push({
      layer: "procurement",
      nodeKey: po.key,
      label: po.label,
      finding: `PO status=${propString(po.props, "status") ?? "unknown"}; expectedAt=${propString(po.props, "expectedAt") ?? "n/a"}.`,
    });

    const materials = edges
      .filter(
        (e) =>
          e.type === "ORDER_CONTAINS" &&
          e.fromId === po._id &&
          byId.get(e.toId)?.type === "Material",
      )
      .map((e) => byId.get(e.toId))
      .filter((n): n is NodeRecord => !!n);

    for (const material of materials) {
      steps.push({
        layer: "inventory",
        nodeKey: material.key,
        label: material.label,
        finding: `Material on ${po.key} — downstream SKUs may slip.`,
      });

      const skus = edges
        .filter((e) => e.type === "MADE_FROM" && e.toId === material._id)
        .map((e) => byId.get(e.fromId))
        .filter((n): n is NodeRecord => !!n && n.type === "SKU");

      for (const sku of skus) {
        const sos = edges
          .filter(
            (e) =>
              e.type === "ORDER_CONTAINS" &&
              e.toId === sku._id &&
              byId.get(e.fromId)?.type === "SalesOrder",
          )
          .map((e) => byId.get(e.fromId))
          .filter((n): n is NodeRecord => !!n);

        for (const so of sos) {
          if (!openSalesStatuses(propString(so.props, "status"))) continue;
          if (affectedSoKeys.has(so.key)) continue;
          affectedSoKeys.add(so.key);
          steps.push({
            layer: "sales",
            nodeKey: so.key,
            label: so.label,
            finding: `Open demand for ${sku.key} (${propNumber(
              edges.find(
                (e) =>
                  e.type === "ORDER_CONTAINS" &&
                  e.fromId === so._id &&
                  e.toId === sku._id,
              )?.props ?? {},
              "qty",
            ) || propNumber(so.props, "qty")} units) exposed to ${po.key} delay.`,
          });
        }
      }
    }

    const aboutSos = edges
      .filter(
        (e) =>
          e.type === "ABOUT" &&
          e.toId === po._id &&
          byId.get(e.fromId)?.type === "SalesOrder",
      )
      .map((e) => byId.get(e.fromId))
      .filter((n): n is NodeRecord => !!n);

    for (const so of aboutSos) {
      if (affectedSoKeys.has(so.key)) continue;
      affectedSoKeys.add(so.key);
      steps.push({
        layer: "sales",
        nodeKey: so.key,
        label: so.label,
        finding: `Graph ABOUT link ties this order directly to ${po.key}.`,
      });
    }

    actions.push({
      label: `Chase vendor on ${po.label}`,
      toolHint: "comms_draft_email",
      nodeKey: po.key,
    });
  }

  const firstPo = focusPos[0];
  const summary =
    firstPo && affectedSoKeys.size > 0
      ? `Delay chain: ${firstPo.key} is late, blocking material inbound and exposing ${affectedSoKeys.size} sales order(s) (${[...affectedSoKeys].slice(0, 3).join(", ")}).`
      : firstPo
        ? `Delay on ${firstPo.key}; no open sales orders linked via MADE_FROM/ABOUT yet.`
        : "No late PO or delayed shipment found.";

  if (firstPo) {
    const matEdge = edges.find(
      (e) =>
        e.type === "ORDER_CONTAINS" &&
        e.fromId === firstPo._id &&
        byId.get(e.toId)?.type === "Material",
    );
    const mat = matEdge ? byId.get(matEdge.toId) : null;
    if (mat) {
      actions.push({
        label: `Explain need / draft alternate PO for ${mat.label}`,
        toolHint: "sourcing_explain_need",
        nodeKey: mat.key,
      });
    }
  }

  return {
    question,
    steps,
    summary,
    recommendedActions: dedupeActions(actions).slice(0, 5),
  };
}

function analyzeStockout(
  question: string,
  nodes: NodeRecord[],
  edges: EdgeRecord[],
  byId: Map<string, NodeRecord>,
  now: Date,
  focusNodeKey?: string,
): RootCauseResult {
  const steps: RootCauseStep[] = [];
  const actions: RootCauseResult["recommendedActions"] = [];

  let stocks = nodes.filter((n) => n.type === "Stock");
  if (focusNodeKey) {
    const focus = nodes.find((n) => n.key === focusNodeKey);
    if (focus?.type === "Stock") {
      stocks = [focus];
    } else if (focus?.type === "SKU") {
      stocks = stocks.filter((s) =>
        edges.some(
          (e) =>
            e.type === "STOCK_OF" && e.fromId === s._id && e.toId === focus._id,
        ),
      );
    }
  }

  for (const stock of stocks) {
    const onHand = propNumber(stock.props, "on_hand");
    const reserved = propNumber(stock.props, "reserved");
    const available = onHand - reserved;
    const skuEdge = edges.find(
      (e) => e.type === "STOCK_OF" && e.fromId === stock._id,
    );
    const sku = skuEdge ? byId.get(skuEdge.toId) : null;

    steps.push({
      layer: "inventory",
      nodeKey: stock.key,
      label: stock.label,
      finding: `on_hand=${onHand}, reserved=${reserved}, available=${available}.`,
    });

    if (!sku) continue;

    let demand = 0;
    const openSos: NodeRecord[] = [];
    for (const e of edges) {
      if (e.type !== "ORDER_CONTAINS" || e.toId !== sku._id) continue;
      const so = byId.get(e.fromId);
      if (!so || so.type !== "SalesOrder") continue;
      if (!openSalesStatuses(propString(so.props, "status"))) continue;
      demand += propNumber(e.props, "qty") || propNumber(so.props, "qty");
      openSos.push(so);
    }

    if (openSos.length > 0) {
      steps.push({
        layer: "sales",
        nodeKey: sku.key,
        label: sku.label,
        finding: `Open SO demand ${demand} units across ${openSos.length} order(s); available ${available}.`,
      });
      for (const so of openSos.slice(0, 3)) {
        steps.push({
          layer: "sales",
          nodeKey: so.key,
          label: so.label,
          finding: `Status=${propString(so.props, "status") ?? "unknown"}; promise=${propString(so.props, "promise_date") ?? "n/a"}.`,
        });
      }
    }

    const materials = edges
      .filter((e) => e.type === "MADE_FROM" && e.fromId === sku._id)
      .map((e) => byId.get(e.toId))
      .filter((n): n is NodeRecord => !!n && n.type === "Material");

    for (const material of materials) {
      const inboundPos = edges
        .filter(
          (e) =>
            e.type === "ORDER_CONTAINS" &&
            e.toId === material._id &&
            byId.get(e.fromId)?.type === "PurchaseOrder",
        )
        .map((e) => byId.get(e.fromId))
        .filter((n): n is NodeRecord => {
          if (!n) return false;
          const status = propString(n.props, "status");
          return status !== "received" && status !== "cancelled";
        });

      for (const po of inboundPos) {
        steps.push({
          layer: "procurement",
          nodeKey: po.key,
          label: po.label,
          finding: `Inbound PO for ${material.label}; status=${propString(po.props, "status") ?? "unknown"}${isLatePo(po, now) ? " (LATE)" : ""}.`,
        });
        if (isLatePo(po, now)) {
          actions.push({
            label: `Chase late inbound ${po.label}`,
            toolHint: "comms_draft_email",
            nodeKey: po.key,
          });
        }
      }

      if (inboundPos.length === 0 && available < demand) {
        actions.push({
          label: `Source ${material.label} to cover ${sku.label}`,
          toolHint: "sourcing_draft_po",
          nodeKey: material.key,
        });
      }
    }

    if (available < demand || available <= 0) {
      actions.push({
        label: `Check promise risk for ${sku.label}`,
        toolHint: "inventory_promise_query",
        nodeKey: sku.key,
      });
    }
  }

  const tight = steps.filter(
    (s) =>
      s.layer === "inventory" &&
      /available=-?\d+/.test(s.finding) &&
      (() => {
        const m = s.finding.match(/available=(-?\d+)/);
        return m ? Number(m[1]) <= 3 : false;
      })(),
  );

  const summary =
    tight.length > 0
      ? `Inventory pressure on ${tight.length} stock node(s) with low available qty — open demand and late inbound POs are the primary drivers.`
      : stocks.length > 0
        ? "Stock nodes reviewed; no critical available<=3 shortfalls flagged, but compare demand vs inbound before promising."
        : "No Stock nodes found.";

  return {
    question,
    steps,
    summary,
    recommendedActions: dedupeActions(actions).slice(0, 5),
  };
}

function dedupeActions(
  actions: RootCauseResult["recommendedActions"],
): RootCauseResult["recommendedActions"] {
  const seen = new Set<string>();
  const out: RootCauseResult["recommendedActions"] = [];
  for (const a of actions) {
    const key = `${a.toolHint}|${a.nodeKey}|${a.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function unknownTemplate(question: string): RootCauseResult {
  return {
    question,
    steps: [],
    summary:
      'No matching analysis template. Try keywords like "margin", "profit", "cost", "cash", "receivables", "delay", "late", "stockout", "low stock", or "inventory".',
    recommendedActions: [
      {
        label: "List current exceptions",
        toolHint: "graph_list_exceptions",
        nodeKey: "Org:Arka-Atelier",
      },
      {
        label: "Browse graph overview",
        toolHint: "list_all_data",
        nodeKey: "Org:Arka-Atelier",
      },
    ],
  };
}

export async function rootCauseAnalysis(
  store: GraphStore,
  orgId: string,
  input: { question: string; focusNodeKey?: string },
): Promise<RootCauseResult> {
  const kind = detectKind(input.question);
  if (!kind) {
    return unknownTemplate(input.question);
  }

  const { nodes, edges, byId, byKey } = await loadGraph(store, orgId);
  const now = new Date();
  const focus = input.focusNodeKey;

  switch (kind) {
    case "margin":
      return analyzeMargin(input.question, nodes, edges, byId, now, focus);
    case "cash":
      return analyzeCash(input.question, nodes, edges, byId, now, focus);
    case "delay":
      return analyzeDelay(
        input.question,
        nodes,
        edges,
        byId,
        byKey,
        now,
        focus,
      );
    case "stockout":
      return analyzeStockout(input.question, nodes, edges, byId, now, focus);
  }
}
