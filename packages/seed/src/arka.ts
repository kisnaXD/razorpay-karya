import type { GraphStore } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";
import type { NodeRecord } from "@karya/graph";

const ORG = "org_arka";
const DAY_MS = 86400000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

function nextFriday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  return "Friday";
}

function nextThursday1600Ist(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilThursday = (4 - day + 7) % 7 || 7;
  const thursday = new Date(now);
  thursday.setDate(now.getDate() + daysUntilThursday);
  thursday.setUTCHours(10, 30, 0, 0);
  return thursday.toISOString();
}

function node(
  key: string,
  type: NodeRecord["type"],
  label: string,
  props: NodeRecord["props"] = {},
): Omit<NodeRecord, "createdAt" | "updatedAt"> {
  return {
    _id: newNodeId(),
    orgId: ORG,
    type,
    key,
    label,
    props,
  };
}

export async function seedArkaAtelier(
  store: GraphStore,
): Promise<{ orgId: string; nodes: number; edges: number }> {
  let edgeCount = 0;

  const write = async (
    type: Parameters<GraphStore["writeEdge"]>[0]["type"],
    fromId: string,
    toId: string,
    props: Record<string, string | number | boolean | null> = {},
  ) => {
    await store.writeEdge({
      _id: newEdgeId(),
      orgId: ORG,
      type,
      fromId,
      toId,
      props,
      validFrom: new Date(),
    });
    edgeCount += 1;
  };

  const arka = await store.upsertNode(
    node("Org:Arka-Atelier", "Org", "Arka Atelier", {
      role: "merchant",
      cashInPaise: 42000000,
      city: "Jaipur",
    }),
  );
  const anika = await store.upsertNode(
    node("Person:Anika", "Person", "Anika", { role: "founder" }),
  );
  const rafi = await store.upsertNode(
    node("Person:Rafi", "Person", "Rafi", { role: "workshop" }),
  );
  const meenakshi = await store.upsertNode(
    node("Org:Meenakshi-Brass", "Org", "Meenakshi Brass", {
      role: "vendor",
      verified_bank: true,
      city: "Moradabad",
    }),
  );
  const lotus = await store.upsertNode(
    node("Org:Lotus-Boutique", "Org", "Lotus Boutique", {
      role: "customer",
      city: "Mumbai",
    }),
  );
  const delhivery = await store.upsertNode(
    node("Org:Delhivery", "Org", "Delhivery", { role: "courier" }),
  );
  const brass = await store.upsertNode(
    node("Material:BrassSheet-22g", "Material", "Brass sheet 22g", {
      uom: "kg",
      reorder_point: 15,
    }),
  );
  const diya = await store.upsertNode(
    node("SKU:Diya-Large", "SKU", "Diya-Large", {
      priceInPaise: 185000,
      gst: 12,
      lead_days: 5,
    }),
  );
  const tray = await store.upsertNode(
    node("SKU:Tray-Oval", "SKU", "Tray-Oval", { priceInPaise: 240000 }),
  );
  const workshop = await store.upsertNode(
    node("Location:Workshop", "Location", "Workshop"),
  );
  const diyaStock = await store.upsertNode(
    node("Stock:Diya-Large@Workshop", "Stock", "Diya-Large @ Workshop", {
      on_hand: 12,
      reserved: 9,
      incoming: 40,
    }),
  );
  const trayStock = await store.upsertNode(
    node("Stock:Tray-Oval@Workshop", "Stock", "Tray-Oval @ Workshop", {
      on_hand: 20,
      reserved: 0,
    }),
  );
  const po104 = await store.upsertNode(
    node("PurchaseOrder:PO-104", "PurchaseOrder", "PO-104", {
      status: "late",
      expectedAt: daysAgo(4),
      qty: 40,
    }),
  );
  const in77 = await store.upsertNode(
    node("Shipment:IN-77", "Shipment", "IN-77", {
      direction: "inbound",
      status: "delayed",
      delay_days: 4,
    }),
  );
  const so218 = await store.upsertNode(
    node("SalesOrder:SO-218", "SalesOrder", "SO-218", {
      status: "promised",
      promise_date: nextFriday(),
      qty: 8,
    }),
  );
  const so201 = await store.upsertNode(
    node("SalesOrder:SO-201", "SalesOrder", "SO-201", {
      status: "packing",
      channel: "d2c",
    }),
  );
  const inv90 = await store.upsertNode(
    node("Invoice:INV-90", "Invoice", "INV-90", {
      status: "overdue",
      amountInPaise: 1480000,
      dueAt: daysAgo(11),
    }),
  );
  const plink7 = await store.upsertNode(
    node("Payment:plink_7", "Payment", "plink_7", {
      status: "sent",
      channel: "payment_link",
      amountInPaise: 1480000,
    }),
  );
  const lead = await store.upsertNode(
    node("Lead:IG-Ananya", "Lead", "IG-Ananya", {
      channel: "instagram",
      status: "open",
    }),
  );
  const listing = await store.upsertNode(
    node("Listing:Diya-Large-Instagram", "Listing", "Diya-Large Instagram", {
      channel: "instagram",
      priceInPaise: 185000,
    }),
  );
  const meeting = await store.upsertNode(
    node("Meeting:VendorCall-Thu", "Meeting", "Vendor call Thu", {
      startsAt: nextThursday1600Ist(),
    }),
  );
  const message = await store.upsertNode(
    node("Message:Vendor-Nudge", "Message", "Vendor nudge", {
      channel: "email",
      direction: "out",
    }),
  );
  const payVendor = await store.upsertNode(
    node("Policy:pay.vendor", "Policy", "Pay vendor policy", {
      maxInPaise: 2500000,
    }),
  );
  const collectInvoice = await store.upsertNode(
    node("Policy:collect.invoice", "Policy", "Collect invoice policy", {
      autonomy: true,
    }),
  );

  await write("OWNS", anika._id, arka._id);
  await write("EMPLOYS", arka._id, rafi._id);
  await write("SUPPLIES", meenakshi._id, brass._id);
  await write("ORDER_CONTAINS", po104._id, brass._id, { qty: 40, uom: "kg" });
  await write("FULFILLS", in77._id, po104._id);
  await write("MADE_FROM", diya._id, brass._id, { qty: 0.35, uom: "kg" });
  await write("STOCK_OF", diyaStock._id, diya._id);
  await write("STOCK_OF", trayStock._id, tray._id);
  await write("LOCATED_AT", diyaStock._id, workshop._id);
  await write("LOCATED_AT", trayStock._id, workshop._id);
  await write("ORDER_CONTAINS", so218._id, diya._id, { qty: 8 });
  await write("ORDER_CONTAINS", so201._id, tray._id, { qty: 1 });
  await write("BUYS", lotus._id, so218._id);
  await write("INVOICES", inv90._id, so218._id);
  await write("PAYS", plink7._id, inv90._id);
  await write("SOURCED_FROM", lead._id, listing._id);
  await write("LISTS", listing._id, diya._id);
  await write("ABOUT", meeting._id, po104._id);
  await write("ABOUT", message._id, po104._id);

  const nodes = await store.listNodes(ORG);
  return { orgId: ORG, nodes: nodes.length, edges: edgeCount };
}
