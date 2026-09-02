import type { GraphStore, NodeRecord } from "@karya/graph";

export type TimelineEntry = {
  at: string;
  kind: "message" | "order" | "payment" | "meeting" | "invoice";
  nodeKey: string;
  label: string;
  summary: string;
};

const TIMELINE_TYPES = new Set([
  "Message",
  "SalesOrder",
  "PurchaseOrder",
  "Payment",
  "Meeting",
  "Invoice",
]);

const PICKER_ORG_KEYS = [
  "Org:Meenakshi-Brass",
  "Org:Lotus-Boutique",
  "Org:Arka-Atelier",
] as const;

function propString(
  props: NodeRecord["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function propNumber(
  props: NodeRecord["props"],
  key: string,
): number | null {
  const value = props[key];
  return typeof value === "number" ? value : null;
}

function entryKind(
  type: NodeRecord["type"],
): TimelineEntry["kind"] | null {
  switch (type) {
    case "Message":
      return "message";
    case "SalesOrder":
    case "PurchaseOrder":
      return "order";
    case "Payment":
      return "payment";
    case "Meeting":
      return "meeting";
    case "Invoice":
      return "invoice";
    default:
      return null;
  }
}

function entryAt(node: NodeRecord): string {
  return (
    propString(node.props, "startsAt") ??
    propString(node.props, "sentAt") ??
    propString(node.props, "dueAt") ??
    propString(node.props, "expectedAt") ??
    propString(node.props, "createdAt") ??
    node.createdAt.toISOString()
  );
}

function entrySummary(node: NodeRecord): string {
  const status = propString(node.props, "status");
  const channel = propString(node.props, "channel");
  const qty = propNumber(node.props, "qty");
  const amount = propNumber(node.props, "amountInPaise");
  const parts = [
    status ? `status ${status}` : null,
    channel ? channel : null,
    qty != null ? `qty ${qty}` : null,
    amount != null ? `₹${(amount / 100).toLocaleString("en-IN")}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : node.label;
}

export async function listPeopleOrgs(
  store: GraphStore,
  orgId: string,
): Promise<NodeRecord[]> {
  const orgs: NodeRecord[] = [];
  for (const key of PICKER_ORG_KEYS) {
    const node = await store.getNodeByKey(orgId, key);
    if (node) orgs.push(node);
  }
  return orgs;
}

export async function getOrgTimeline(
  store: GraphStore,
  orgId: string,
  orgKey: string,
): Promise<{ org: NodeRecord; entries: TimelineEntry[] }> {
  const org = await store.getNodeByKey(orgId, orgKey);
  if (!org || org.type !== "Org") {
    throw new Error(`Org not found: ${orgKey}`);
  }

  const hood = await store.neighborhood(orgId, org._id, 2);
  const byId = new Map<string, NodeRecord>();
  for (const n of hood.nodes) {
    if (TIMELINE_TYPES.has(n.type)) byId.set(n._id, n);
  }

  // Extra hop: payments on invoices within the neighborhood (depth-3 for PAYS).
  for (const n of [...byId.values()]) {
    if (n.type !== "Invoice") continue;
    const invHood = await store.neighborhood(orgId, n._id, 1);
    for (const edge of invHood.edges) {
      if (edge.type !== "PAYS" || edge.validTo !== null) continue;
      if (edge.toId !== n._id) continue;
      const payment =
        invHood.nodes.find((x) => x._id === edge.fromId) ??
        (await store.getNode(orgId, edge.fromId));
      if (payment?.type === "Payment") byId.set(payment._id, payment);
    }
  }

  const entries: TimelineEntry[] = [];
  for (const node of byId.values()) {
    const kind = entryKind(node.type);
    if (!kind) continue;
    entries.push({
      at: entryAt(node),
      kind,
      nodeKey: node.key,
      label: node.label,
      summary: entrySummary(node),
    });
  }

  entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { org, entries: entries.slice(0, 20) };
}
