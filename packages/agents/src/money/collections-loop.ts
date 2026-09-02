import type { GraphStore, NodeRecord } from "@karya/graph";
import type { EvaluateOutcome, ProposedAction } from "@karya/policy";

export type CollectionsDeps = {
  evaluate: (proposed: ProposedAction) => Promise<EvaluateOutcome>;
  createApproval: (
    proposed: ProposedAction,
  ) => Promise<
    | { approval: { _id: string } }
    | { autoAllowed: true; evaluation: EvaluateOutcome }
  >;
  createLink: (input: {
    invoiceKey: string;
    actor?: string;
  }) => Promise<{ paymentNode: { key: string }; created: boolean }>;
  audit: (input: {
    eventType: string;
    sideEffectClass: "read" | "draft" | "write" | "money" | "external";
    payload: Record<string, unknown>;
    aboutNodeIds?: string[];
  }) => Promise<unknown>;
};

export type CollectionsOutcome =
  | "auto_sent"
  | "approval_created"
  | "skipped"
  | "escalated"
  | "denied";

function propNumber(props: NodeRecord["props"], key: string): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function formatInrFull(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Skip collections when a linked payment is still open (sent) or already in a
 * terminal failure state (expired/failed) — recovery flow owns those.
 */
async function hasBlockingPaymentLink(
  store: GraphStore,
  orgId: string,
  invoice: NodeRecord,
): Promise<boolean> {
  const hood = await store.neighborhood(orgId, invoice._id, 1);
  for (const edge of hood.edges) {
    if (
      edge.type === "PAYS" &&
      edge.toId === invoice._id &&
      edge.validTo === null
    ) {
      const payment =
        hood.nodes.find((n) => n._id === edge.fromId) ??
        (await store.getNode(orgId, edge.fromId));
      if (payment?.type !== "Payment") continue;
      const status = payment.props.status;
      if (
        status === "sent" ||
        status === "expired" ||
        status === "failed"
      ) {
        return true;
      }
    }
  }
  return false;
}

async function resolveBuyerLabel(
  store: GraphStore,
  orgId: string,
  invoice: NodeRecord,
): Promise<string> {
  const hood = await store.neighborhood(orgId, invoice._id, 2);
  const invoices = hood.edges.find(
    (e) =>
      e.type === "INVOICES" && e.fromId === invoice._id && e.validTo === null,
  );
  if (!invoices) return "customer";
  const buys = hood.edges.find(
    (e) =>
      e.type === "BUYS" && e.toId === invoices.toId && e.validTo === null,
  );
  if (!buys) return "customer";
  const buyer =
    hood.nodes.find((n) => n._id === buys.fromId) ??
    (await store.getNode(orgId, buys.fromId));
  return buyer?.label ?? "customer";
}

export async function runCollectionsLoop(
  store: GraphStore,
  orgId: string,
  deps: CollectionsDeps,
): Promise<{
  processed: Array<{ invoiceKey: string; outcome: CollectionsOutcome }>;
}> {
  const exceptions = await store.exceptions(orgId);
  const overdue = exceptions.filter((e) => e.code === "invoice.overdue");
  const processed: Array<{ invoiceKey: string; outcome: CollectionsOutcome }> =
    [];

  for (const ex of overdue) {
    const invoice = await store.getNode(orgId, ex.nodeId);
    if (!invoice || invoice.type !== "Invoice") continue;

    const nudgeCount = propNumber(invoice.props, "nudge_count");

    if (nudgeCount >= 3) {
      await store.upsertNode({
        _id: invoice._id,
        orgId: invoice.orgId,
        type: invoice.type,
        key: invoice.key,
        label: invoice.label,
        props: {
          ...invoice.props,
          collections_state: "escalated",
        },
      });
      processed.push({ invoiceKey: invoice.key, outcome: "escalated" });
      continue;
    }

    if (await hasBlockingPaymentLink(store, orgId, invoice)) {
      processed.push({ invoiceKey: invoice.key, outcome: "skipped" });
      continue;
    }

    const amountInPaise = propNumber(invoice.props, "amountInPaise");
    const buyer = await resolveBuyerLabel(store, orgId, invoice);
    const proposed: ProposedAction = {
      action: "collect.invoice",
      orgId,
      targetNodeKey: invoice.key,
      amountInPaise,
      proposedBy: "agent:money",
      explanation: `Send Payment Link for ${invoice.label} (${formatInrFull(amountInPaise)}) to ${buyer}.`,
    };

    const evaluation = await deps.evaluate(proposed);

    if (evaluation.finalDecision === "deny") {
      await deps.audit({
        eventType: "collections.denied",
        sideEffectClass: "read",
        payload: { invoiceKey: invoice.key, evaluation },
        aboutNodeIds: [invoice._id],
      });
      processed.push({ invoiceKey: invoice.key, outcome: "denied" });
      continue;
    }

    if (evaluation.finalDecision === "require_approval") {
      await deps.createApproval(proposed);
      processed.push({ invoiceKey: invoice.key, outcome: "approval_created" });
      continue;
    }

    // allow — auto-send
    await deps.createLink({
      invoiceKey: invoice.key,
      actor: "agent:money",
    });

    const refreshed = await store.getNodeByKey(orgId, invoice.key);
    if (refreshed) {
      await store.upsertNode({
        _id: refreshed._id,
        orgId: refreshed.orgId,
        type: refreshed.type,
        key: refreshed.key,
        label: refreshed.label,
        props: {
          ...refreshed.props,
          nudge_count: propNumber(refreshed.props, "nudge_count") + 1,
          last_nudge_at: new Date().toISOString(),
          collections_state: "link_sent",
        },
      });
    }

    processed.push({ invoiceKey: invoice.key, outcome: "auto_sent" });
  }

  await deps.audit({
    eventType: "collections.tick",
    sideEffectClass: "write",
    payload: { processed },
  });

  return { processed };
}

export function countPaymentLinkCreatedEvents(
  events: NodeRecord[],
  invoiceKey: string,
): number {
  return events.filter((e) => {
    if (e.props.event_type !== "payment_link.created") return false;
    const raw = e.props.payload_json;
    if (typeof raw !== "string") return false;
    try {
      const payload = JSON.parse(raw) as { invoiceKey?: string };
      return payload.invoiceKey === invoiceKey;
    } catch {
      return false;
    }
  }).length;
}
