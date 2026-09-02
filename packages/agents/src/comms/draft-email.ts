import type { GraphStore, NodeRecord } from "@karya/graph";

export type EmailTone = "firm" | "friendly";

export type EmailFactBundle = {
  aboutNodeKey: string;
  recipientOrgKey: string;
  recipientLabel: string;
  poQty: number | null;
  delayDays: number | null;
  expectedAt: string | null;
  dependentSoKey: string | null;
  dependentSoQty: number | null;
  lastMessageSnippet: string | null;
};

export type EmailDraft = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

function propNumber(
  props: NodeRecord["props"],
  key: string,
): number | null {
  const value = props[key];
  return typeof value === "number" ? value : null;
}

function propString(
  props: NodeRecord["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

export function buildEmailDraft(
  facts: EmailFactBundle,
  tone: EmailTone = "firm",
): EmailDraft {
  const poLabel = facts.aboutNodeKey.replace(/^PurchaseOrder:/, "");
  const delay =
    facts.delayDays != null ? `${facts.delayDays} days late` : "delayed";
  const qtyLine =
    facts.poQty != null ? `${facts.poQty}kg brass sheet` : "brass sheet";
  const demand =
    facts.dependentSoKey && facts.dependentSoQty != null
      ? `${facts.dependentSoKey.replace(/^SalesOrder:/, "")} (${facts.dependentSoQty}× Diya-Large) is waiting on this shipment.`
      : "A customer order is waiting on this shipment.";

  const greeting =
    tone === "friendly"
      ? `Hi ${facts.recipientLabel} team,`
      : `Hello ${facts.recipientLabel},`;

  const ask =
    tone === "friendly"
      ? "Could you share the revised dispatch date or confirm if the remaining material can ship by air?"
      : "Please confirm dispatch date for the full quantity, or air the remaining 15kg today.";

  const subject = `${poLabel} — brass sheet dispatch update`;
  const bodyText = [
    greeting,
    "",
    `Following up on ${poLabel} (${qtyLine}) — currently ${delay}.`,
    demand,
    facts.lastMessageSnippet
      ? `Last note on file: ${facts.lastMessageSnippet}`
      : null,
    "",
    ask,
    "",
    "Thanks,",
    "Anika · Arka Atelier",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const bodyHtml = bodyText
    .split("\n")
    .map((line) => (line.length === 0 ? "<br/>" : `<p>${line}</p>`))
    .join("");

  return { subject, bodyText, bodyHtml };
}

export async function loadEmailFacts(
  store: GraphStore,
  orgId: string,
  aboutNodeKey: string,
  recipientOrgKey: string,
): Promise<EmailFactBundle> {
  const about = await store.getNodeByKey(orgId, aboutNodeKey);
  if (!about) throw new Error(`Node not found: ${aboutNodeKey}`);

  const recipient = await store.getNodeByKey(orgId, recipientOrgKey);
  if (!recipient || recipient.type !== "Org") {
    throw new Error(`Org not found: ${recipientOrgKey}`);
  }

  let poQty: number | null = null;
  let delayDays: number | null = null;
  let expectedAt: string | null = null;
  let dependentSoKey: string | null = null;
  let dependentSoQty: number | null = null;
  let lastMessageSnippet: string | null = null;

  if (about.type === "PurchaseOrder") {
    poQty = propNumber(about.props, "qty");
    expectedAt = propString(about.props, "expectedAt");
    const hood = await store.neighborhood(orgId, about._id, 1);
    for (const edge of hood.edges) {
      if (edge.validTo !== null) continue;
      if (edge.type === "FULFILLS" && edge.toId === about._id) {
        const ship = hood.nodes.find((n) => n._id === edge.fromId);
        delayDays = propNumber(ship?.props ?? {}, "delay_days");
      }
      if (edge.type === "ABOUT" && edge.toId === about._id) {
        const n = hood.nodes.find((x) => x._id === edge.fromId);
        if (n?.type === "SalesOrder") {
          dependentSoKey = n.key;
          dependentSoQty = propNumber(n.props, "qty");
        }
        if (n?.type === "Message") {
          lastMessageSnippet =
            propString(n.props, "subject") ??
            propString(n.props, "body_text") ??
            n.label;
        }
      }
    }
  }

  return {
    aboutNodeKey,
    recipientOrgKey,
    recipientLabel: recipient.label,
    poQty,
    delayDays,
    expectedAt,
    dependentSoKey,
    dependentSoQty,
    lastMessageSnippet,
  };
}

export async function draftVendorChaseEmail(
  store: GraphStore,
  orgId: string,
  input: {
    aboutNodeKey: string;
    recipientOrgKey: string;
    tone?: EmailTone;
  },
): Promise<EmailDraft> {
  const facts = await loadEmailFacts(
    store,
    orgId,
    input.aboutNodeKey,
    input.recipientOrgKey,
  );
  return buildEmailDraft(facts, input.tone ?? "firm");
}
