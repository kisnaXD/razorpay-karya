import type { GraphStore, NodeRecord } from "@karya/graph";

export type LedgerEntry = {
  node: NodeRecord;
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
  entries: LedgerEntry[];
};

function propNumber(props: NodeRecord["props"], key: string): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function propString(props: NodeRecord["props"], key: string): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

async function resolveCounterparty(
  store: GraphStore,
  orgId: string,
  payment: NodeRecord,
): Promise<string | null> {
  const hood = await store.neighborhood(orgId, payment._id, 2);
  const pays = hood.edges.find(
    (e) =>
      e.type === "PAYS" && e.fromId === payment._id && e.validTo === null,
  );
  if (!pays) return null;

  const target =
    hood.nodes.find((n) => n._id === pays.toId) ??
    (await store.getNode(orgId, pays.toId));
  if (!target) return null;

  if (target.type === "Invoice") {
    const invHood = await store.neighborhood(orgId, target._id, 2);
    const invoices = invHood.edges.find(
      (e) =>
        e.type === "INVOICES" &&
        e.fromId === target._id &&
        e.validTo === null,
    );
    if (invoices) {
      const buys = invHood.edges.find(
        (e) =>
          e.type === "BUYS" &&
          e.toId === invoices.toId &&
          e.validTo === null,
      );
      if (buys) {
        const buyer =
          invHood.nodes.find((n) => n._id === buys.fromId) ??
          (await store.getNode(orgId, buys.fromId));
        return buyer?.label ?? null;
      }
    }
  }

  if (payment.props.channel === "payout") {
    return (
      propString(payment.props, "vendor_label") ??
      propString(payment.props, "counterparty") ??
      null
    );
  }

  return target.label;
}

export async function getLedger(
  store: GraphStore,
  orgId: string,
): Promise<LedgerSummary> {
  const payments = await store.listNodes(orgId, "Payment");
  const invoices = await store.listNodes(orgId, "Invoice");
  const entries: LedgerEntry[] = [];

  let cashInPaise = 0;
  let payoutsOutInPaise = 0;

  for (const payment of payments) {
    const channel = propString(payment.props, "channel");
    const amountInPaise = propNumber(payment.props, "amountInPaise");
    const status = propString(payment.props, "status") ?? "unknown";
    const at =
      propString(payment.props, "failure_at") ??
      payment.updatedAt.toISOString();
    const counterparty = await resolveCounterparty(store, orgId, payment);

    if (channel === "payout") {
      payoutsOutInPaise +=
        status === "processed" || status === "sent" ? amountInPaise : 0;
      entries.push({
        node: payment,
        direction: "out",
        amountInPaise,
        status,
        counterparty,
        at,
      });
      continue;
    }

    if (channel === "payment_link" || payment.props.razorpay_payment_link_id) {
      if (status === "captured" || status === "paid") {
        cashInPaise += amountInPaise;
      }
      entries.push({
        node: payment,
        direction: "in",
        amountInPaise,
        status,
        counterparty,
        at,
      });
    }
  }

  let receivablesInPaise = 0;
  for (const inv of invoices) {
    const status = propString(inv.props, "status");
    if (status === "overdue" || status === "sent") {
      receivablesInPaise += propNumber(inv.props, "amountInPaise");
    }
  }

  entries.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return {
    cashInPaise,
    receivablesInPaise,
    payablesInPaise: 0,
    payoutsOutInPaise,
    entries,
  };
}
