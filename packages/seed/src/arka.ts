import type { Db } from "mongodb";
import type { GraphStore } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";
import type { NodeRecord } from "@karya/graph";
import { ulid } from "ulid";

const ORG = "org_arka";
const DAY_MS = 86400000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * DAY_MS).toISOString();
}

function nextFriday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  return "Friday";
}

function nextMonday0900Ist(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 1=Mon
  const daysUntil = (1 - day + 7) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntil);
  monday.setUTCHours(3, 30, 0, 0); // 09:00 IST
  return monday.toISOString();
}

function nearestThursday1600Ist(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 4=Thu
  const daysUntilNext = (4 - day + 7) % 7;
  const daysSincePrev = (day - 4 + 7) % 7;
  let delta = 0;
  if (daysUntilNext !== 0) {
    delta = daysSincePrev <= daysUntilNext ? -daysSincePrev : daysUntilNext;
  }
  const thursday = new Date(now);
  thursday.setDate(now.getDate() + delta);
  thursday.setUTCHours(10, 30, 0, 0); // 16:00 IST
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
  db: Db,
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
  const shreeMetal = await store.upsertNode(
    node("Org:Shree-Metal-Works", "Org", "Shree Metal Works", {
      role: "vendor",
      verified_bank: true,
      city: "Aligarh",
    }),
  );
  const jaipurAlloys = await store.upsertNode(
    node("Org:Jaipur-Alloys", "Org", "Jaipur Alloys", {
      role: "vendor",
      verified_bank: false,
      city: "Jaipur",
    }),
  );
  const lotus = await store.upsertNode(
    node("Org:Lotus-Boutique", "Org", "Lotus Boutique", {
      role: "customer",
      city: "Mumbai",
    }),
  );
  const rangoli = await store.upsertNode(
    node("Org:Rangoli-Retail", "Org", "Rangoli Retail", {
      role: "customer",
      city: "Delhi",
      note: "Loyal wholesale buyer — Diwali surge orders",
    }),
  );
  const artisanHouse = await store.upsertNode(
    node("Org:Artisan-House", "Org", "Artisan House", {
      role: "customer",
      city: "Bengaluru",
      note: "New boutique — first order",
    }),
  );
  const craftCentral = await store.upsertNode(
    node("Org:Craft-Central", "Org", "Craft Central", {
      role: "customer",
      city: "Pune",
      note: "Repeat buyer — often pays late",
    }),
  );
  const heritageGallery = await store.upsertNode(
    node("Org:Heritage-Gallery", "Org", "Heritage Gallery", {
      role: "customer",
      city: "Udaipur",
      note: "Premium buyer — always on time",
    }),
  );
  const diwaliBazaar = await store.upsertNode(
    node("Org:Diwali-Bazaar", "Org", "Diwali Bazaar", {
      role: "customer",
      city: "Online",
      channel: "d2c",
      note: "Seasonal surge buyer — Instagram/D2C",
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
  const brassRod = await store.upsertNode(
    node("Material:BrassRod-8mm", "Material", "Brass rod 8mm", {
      uom: "kg",
      reorder_point: 8,
      note: "For handles, temple bells",
    }),
  );
  const copperSheet = await store.upsertNode(
    node("Material:CopperSheet-20g", "Material", "Copper sheet 20g", {
      uom: "kg",
      reorder_point: 5,
      note: "Accent pieces and inlays",
    }),
  );
  const juteCord = await store.upsertNode(
    node("Material:JuteCord-3mm", "Material", "Jute cord 3mm", {
      uom: "m",
      reorder_point: 100,
      note: "Packaging and decor ties",
    }),
  );
  const lacquer = await store.upsertNode(
    node("Material:Lacquer-Clear", "Material", "Clear lacquer", {
      uom: "ltr",
      reorder_point: 2,
      note: "Finishing coat",
    }),
  );
  const diya = await store.upsertNode(
    node("SKU:Diya-Large", "SKU", "Diya-Large", {
      priceInPaise: 185000,
      gst: 12,
      lead_days: 5,
      description: "Large hand-hammered brass diya, 22g sheet, Jaipur workshop.",
      image_urls_json: JSON.stringify([
        "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400",
      ]),
    }),
  );
  const castBlank = await store.upsertNode(
    node("SKU:Cast-Blank-Diya-5in", "SKU", "Cast Blank Diya 5in", {
      priceInPaise: 14500,
    }),
  );
  const diyaSmall = await store.upsertNode(
    node("SKU:Diya-Small", "SKU", "Diya-Small-3inch", {
      priceInPaise: 95000,
    }),
  );
  const tray = await store.upsertNode(
    node("SKU:Tray-Oval", "SKU", "Tray-Oval", { priceInPaise: 240000 }),
  );
  const urli = await store.upsertNode(
    node("SKU:Urli-Round-8in", "SKU", "Urli-Round-8in", {
      priceInPaise: 320000,
      gst: 12,
      lead_days: 7,
      description: "Decorative brass water bowl, 8-inch round, hammered finish.",
    }),
  );
  const lamp = await store.upsertNode(
    node("SKU:Lamp-Hanging-Brass", "SKU", "Lamp-Hanging-Brass", {
      priceInPaise: 450000,
      gst: 12,
      lead_days: 10,
      description: "Handcrafted brass pendant lamp for boutique interiors.",
    }),
  );
  const incense = await store.upsertNode(
    node("SKU:Incense-Holder-Lotus", "SKU", "Incense-Holder-Lotus", {
      priceInPaise: 85000,
      gst: 12,
      lead_days: 4,
      description: "Lotus-motif brass incense holder.",
    }),
  );
  const bell = await store.upsertNode(
    node("SKU:Bell-Temple-6in", "SKU", "Bell-Temple-6in", {
      priceInPaise: 180000,
      gst: 12,
      lead_days: 6,
      description: "6-inch temple bell cast from brass rod stock.",
    }),
  );
  const thali = await store.upsertNode(
    node("SKU:Thali-Pooja-Set", "SKU", "Thali-Pooja-Set", {
      priceInPaise: 550000,
      gst: 12,
      lead_days: 8,
      description: "Premium pooja thali set of 5 brass items.",
    }),
  );
  const candleStand = await store.upsertNode(
    node("SKU:Candle-Stand-3tier", "SKU", "Candle-Stand-3tier", {
      priceInPaise: 280000,
      gst: 12,
      lead_days: 6,
      description: "Three-tier brass candle stand for festive displays.",
    }),
  );
  const workshop = await store.upsertNode(
    node("Location:Workshop", "Location", "Workshop"),
  );
  const diyaStock = await store.upsertNode(
    node("Stock:Diya-Large@Workshop", "Stock", "Diya-Large @ Workshop", {
      on_hand: 12,
      reserved: 9,
      incoming: 40,
      hold_until: null,
    }),
  );
  const trayStock = await store.upsertNode(
    node("Stock:Tray-Oval@Workshop", "Stock", "Tray-Oval @ Workshop", {
      on_hand: 20,
      reserved: 0,
    }),
  );
  const diyaSmallStock = await store.upsertNode(
    node("Stock:Diya-Small@Workshop", "Stock", "Diya-Small @ Workshop", {
      on_hand: 85,
      reserved: 40,
      incoming: 0,
    }),
  );
  const castBlankStock = await store.upsertNode(
    node("Stock:Cast-Blank-Diya-5in@Workshop", "Stock", "Cast Blank @ Workshop", {
      on_hand: 180,
      reserved: 0,
      incoming: 0,
    }),
  );
  const urliStock = await store.upsertNode(
    node("Stock:Urli-Round-8in@Workshop", "Stock", "Urli-Round @ Workshop", {
      on_hand: 3,
      reserved: 5,
      incoming: 0,
      note: "Negative available — Rangoli surge overcommitted",
    }),
  );
  const lampStock = await store.upsertNode(
    node("Stock:Lamp-Hanging-Brass@Workshop", "Stock", "Lamp-Hanging @ Workshop", {
      on_hand: 4,
      reserved: 4,
      incoming: 0,
    }),
  );
  const incenseStock = await store.upsertNode(
    node("Stock:Incense-Holder-Lotus@Workshop", "Stock", "Incense-Holder @ Workshop", {
      on_hand: 42,
      reserved: 6,
      incoming: 0,
    }),
  );
  const bellStock = await store.upsertNode(
    node("Stock:Bell-Temple-6in@Workshop", "Stock", "Bell-Temple @ Workshop", {
      on_hand: 0,
      reserved: 0,
      incoming: 12,
      note: "Stockout — rods inbound on PO-105 path",
    }),
  );
  const thaliStock = await store.upsertNode(
    node("Stock:Thali-Pooja-Set@Workshop", "Stock", "Thali-Pooja @ Workshop", {
      on_hand: 14,
      reserved: 2,
      incoming: 0,
    }),
  );
  const candleStock = await store.upsertNode(
    node("Stock:Candle-Stand-3tier@Workshop", "Stock", "Candle-Stand @ Workshop", {
      on_hand: 6,
      reserved: 8,
      incoming: 10,
    }),
  );
  const po104 = await store.upsertNode(
    node("PurchaseOrder:PO-104", "PurchaseOrder", "PO-104", {
      status: "late",
      expectedAt: daysAgo(4),
      qty: 40,
      amountInPaise: 2720000,
      vendorKey: "Org:Meenakshi-Brass",
    }),
  );
  const po105 = await store.upsertNode(
    node("PurchaseOrder:PO-105", "PurchaseOrder", "PO-105", {
      status: "delivered",
      expectedAt: daysAgo(8),
      deliveredAt: daysAgo(9),
      qty: 25,
      amountInPaise: 1875000,
      vendorKey: "Org:Shree-Metal-Works",
      note: "On-time brass rod delivery",
    }),
  );
  const po106 = await store.upsertNode(
    node("PurchaseOrder:PO-106", "PurchaseOrder", "PO-106", {
      status: "in_transit",
      expectedAt: daysFromNow(2),
      qty: 10,
      amountInPaise: 950000,
      vendorKey: "Org:Jaipur-Alloys",
    }),
  );
  const po107 = await store.upsertNode(
    node("PurchaseOrder:PO-107", "PurchaseOrder", "PO-107", {
      status: "draft",
      expectedAt: daysFromNow(12),
      qty: 60,
      amountInPaise: 4080000,
      vendorKey: "Org:Meenakshi-Brass",
      note: "Pending approval — Diwali buffer stock; Meenakshi reliability concerns",
    }),
  );
  const po108 = await store.upsertNode(
    node("PurchaseOrder:PO-108", "PurchaseOrder", "PO-108", {
      status: "ordered",
      expectedAt: daysFromNow(5),
      qty: 50,
      amountInPaise: 3400000,
      vendorKey: "Org:Shree-Metal-Works",
      note: "Emergency brass for Rangoli SO-220 — preferred vendor",
    }),
  );
  const in77 = await store.upsertNode(
    node("Shipment:IN-77", "Shipment", "IN-77", {
      direction: "inbound",
      status: "delayed",
      delay_days: 4,
    }),
  );
  const in78 = await store.upsertNode(
    node("Shipment:IN-78", "Shipment", "IN-78", {
      direction: "inbound",
      status: "in_transit",
      etaAt: daysFromNow(2),
      carrier: "Delhivery",
    }),
  );
  const out44 = await store.upsertNode(
    node("Shipment:OUT-44", "Shipment", "OUT-44", {
      direction: "outbound",
      status: "delivered",
      deliveredAt: daysAgo(5),
      carrier: "Delhivery",
    }),
  );
  const out45 = await store.upsertNode(
    node("Shipment:OUT-45", "Shipment", "OUT-45", {
      direction: "outbound",
      status: "packing",
      carrier: "Delhivery",
    }),
  );
  const out46 = await store.upsertNode(
    node("Shipment:OUT-46", "Shipment", "OUT-46", {
      direction: "outbound",
      status: "shipped",
      shippedAt: daysAgo(1),
      carrier: "Delhivery",
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
  const so220 = await store.upsertNode(
    node("SalesOrder:SO-220", "SalesOrder", "SO-220", {
      status: "promised",
      promise_date: daysFromNow(10),
      qty: 55,
      orderedAt: daysAgo(0),
      amountInPaise: 17600000,
      note: "Rangoli Diwali surge — strains Urli + brass inventory",
    }),
  );
  const so221 = await store.upsertNode(
    node("SalesOrder:SO-221", "SalesOrder", "SO-221", {
      status: "delivered",
      promise_date: daysAgo(6),
      deliveredAt: daysAgo(5),
      qty: 50,
      orderedAt: daysAgo(18),
      amountInPaise: 27500000,
      note: "Heritage Gallery premium Diwali stock-up",
    }),
  );
  const so222 = await store.upsertNode(
    node("SalesOrder:SO-222", "SalesOrder", "SO-222", {
      status: "shipped",
      promise_date: daysAgo(1),
      shippedAt: daysAgo(1),
      qty: 10,
      orderedAt: daysAgo(12),
      amountInPaise: 2400000,
    }),
  );
  const so223 = await store.upsertNode(
    node("SalesOrder:SO-223", "SalesOrder", "SO-223", {
      status: "promised",
      promise_date: daysFromNow(14),
      qty: 4,
      orderedAt: daysAgo(1),
      amountInPaise: 850000,
      note: "Artisan House first order — starter assortment",
    }),
  );
  const so224 = await store.upsertNode(
    node("SalesOrder:SO-224", "SalesOrder", "SO-224", {
      status: "packing",
      channel: "d2c",
      promise_date: daysFromNow(3),
      qty: 40,
      orderedAt: daysAgo(2),
      amountInPaise: 3800000,
    }),
  );
  const so225 = await store.upsertNode(
    node("SalesOrder:SO-225", "SalesOrder", "SO-225", {
      status: "delivered",
      promise_date: daysAgo(10),
      deliveredAt: daysAgo(9),
      qty: 12,
      orderedAt: daysAgo(21),
      amountInPaise: 2160000,
    }),
  );
  const so226 = await store.upsertNode(
    node("SalesOrder:SO-226", "SalesOrder", "SO-226", {
      status: "shipped",
      promise_date: daysAgo(2),
      shippedAt: daysAgo(2),
      qty: 4,
      orderedAt: daysAgo(14),
      amountInPaise: 1800000,
    }),
  );
  const so227 = await store.upsertNode(
    node("SalesOrder:SO-227", "SalesOrder", "SO-227", {
      status: "cancelled",
      qty: 6,
      orderedAt: daysAgo(7),
      cancelledAt: daysAgo(5),
      amountInPaise: 1680000,
      note: "Craft Central cancelled — payment terms dispute",
    }),
  );
  const so228 = await store.upsertNode(
    node("SalesOrder:SO-228", "SalesOrder", "SO-228", {
      status: "packing",
      promise_date: daysFromNow(4),
      qty: 8,
      orderedAt: daysAgo(3),
      amountInPaise: 2240000,
    }),
  );
  const inv90 = await store.upsertNode(
    node("Invoice:INV-90", "Invoice", "INV-90", {
      status: "overdue",
      amountInPaise: 1480000,
      dueAt: daysAgo(11),
      nudge_count: 1,
      last_nudge_at: daysAgo(3),
      collections_state: "link_sent",
    }),
  );
  const plink7 = await store.upsertNode(
    node("Payment:plink_7", "Payment", "plink_7", {
      status: "sent",
      channel: "payment_link",
      amountInPaise: 1480000,
      razorpay_payment_link_id: "plink_7",
      failure_class: null,
      failure_at: null,
    }),
  );
  const inv91 = await store.upsertNode(
    node("Invoice:INV-91", "Invoice", "INV-91", {
      status: "paid",
      amountInPaise: 27500000,
      dueAt: daysAgo(7),
      paidAt: daysAgo(8),
      collections_state: "paid",
    }),
  );
  const pay91 = await store.upsertNode(
    node("Payment:pay_91", "Payment", "pay_91", {
      status: "captured",
      channel: "neft",
      amountInPaise: 27500000,
      paidAt: daysAgo(8),
    }),
  );
  const inv92 = await store.upsertNode(
    node("Invoice:INV-92", "Invoice", "INV-92", {
      status: "sent",
      amountInPaise: 2160000,
      dueAt: daysFromNow(3),
      sentAt: daysAgo(4),
      collections_state: "awaiting",
    }),
  );
  const inv93 = await store.upsertNode(
    node("Invoice:INV-93", "Invoice", "INV-93", {
      status: "overdue",
      amountInPaise: 2400000,
      dueAt: daysAgo(2),
      nudge_count: 2,
      last_nudge_at: daysAgo(1),
      collections_state: "nudge_sent",
      note: "Craft Central — chronic late payer; cash flow pinch",
    }),
  );
  const inv94 = await store.upsertNode(
    node("Invoice:INV-94", "Invoice", "INV-94", {
      status: "paid",
      amountInPaise: 1800000,
      dueAt: daysAgo(4),
      paidAt: daysAgo(5),
      collections_state: "paid",
    }),
  );
  const pay94 = await store.upsertNode(
    node("Payment:pay_94", "Payment", "pay_94", {
      status: "captured",
      channel: "upi",
      amountInPaise: 1800000,
      paidAt: daysAgo(5),
    }),
  );
  const inv95 = await store.upsertNode(
    node("Invoice:INV-95", "Invoice", "INV-95", {
      status: "draft",
      amountInPaise: 850000,
      dueAt: daysFromNow(21),
      collections_state: "draft",
      note: "Artisan House first invoice — not yet sent",
    }),
  );
  const lead = await store.upsertNode(
    node("Lead:IG-Ananya", "Lead", "IG-Ananya", {
      channel: "instagram",
      status: "open",
    }),
  );
  const leadPriya = await store.upsertNode(
    node("Lead:WhatsApp-Priya", "Lead", "WhatsApp-Priya", {
      channel: "whatsapp",
      status: "warm",
      city: "Chennai",
      note: "Asked about Urli-Round wholesale pricing",
    }),
  );
  const leadExhibition = await store.upsertNode(
    node("Lead:Exhibition-Delhi", "Lead", "Exhibition-Delhi", {
      channel: "trade_show",
      status: "open",
      city: "Delhi",
      note: "India Craft Week contact — bulk Diwali interest",
    }),
  );
  const leadKaran = await store.upsertNode(
    node("Lead:Referral-Karan", "Lead", "Referral-Karan", {
      channel: "referral",
      status: "warm",
      city: "Udaipur",
      note: "Referred by Heritage Gallery",
      referredBy: "Org:Heritage-Gallery",
    }),
  );
  const leadNisha = await store.upsertNode(
    node("Lead:Google-Nisha", "Lead", "Google-Nisha", {
      channel: "website",
      status: "open",
      city: "Hyderabad",
      note: "Website inquiry — Thali-Pooja-Set for wedding",
    }),
  );
  const listing = await store.upsertNode(
    node("Listing:Diya-Large-Instagram", "Listing", "Diya-Large Instagram", {
      channel: "instagram",
      priceInPaise: 185000,
    }),
  );
  const listingUrli = await store.upsertNode(
    node("Listing:Urli-Round-Instagram", "Listing", "Urli-Round Instagram", {
      channel: "instagram",
      priceInPaise: 320000,
    }),
  );
  const meeting = await store.upsertNode(
    node("Meeting:VendorCall-Thu", "Meeting", "Vendor call Thu", {
      startsAt: nearestThursday1600Ist(),
      attendeeOrgKey: "Org:Meenakshi-Brass",
    }),
  );
  const meetingRangoli = await store.upsertNode(
    node("Meeting:CustomerVisit-Rangoli", "Meeting", "Customer visit Rangoli", {
      startsAt: daysFromNow(7),
      attendeeOrgKey: "Org:Rangoli-Retail",
      note: "Delhi showroom visit — confirm SO-220 allocation",
    }),
  );
  const meetingTradeShow = await store.upsertNode(
    node("Meeting:TradeShow-Delhi", "Meeting", "Trade show Delhi", {
      startsAt: daysFromNow(10),
      note: "India Craft Week booth — follow Exhibition-Delhi lead",
    }),
  );
  const meetingBank = await store.upsertNode(
    node("Meeting:BankMeeting", "Meeting", "Bank meeting", {
      startsAt: nextMonday0900Ist(),
      note: "Working-capital line review — Craft Central delays squeezing cash",
    }),
  );
  const message = await store.upsertNode(
    node("Message:Vendor-Nudge", "Message", "Vendor nudge", {
      channel: "email",
      direction: "out",
      status: "sent",
      subject: "PO-104 — awaiting brass dispatch",
      body_text:
        "Please confirm when the remaining brass sheet for PO-104 will leave Moradabad.",
      sentAt: daysAgo(2),
    }),
  );
  const meenakshiContact = await store.upsertNode(
    node("Person:Meenakshi-Contact", "Person", "Meenakshi procurement", {
      role: "vendor_contact",
      email: "procurement@meenakshibrass.example.com",
    }),
  );
  // Legacy pay.vendor policy kept disabled — authority UI uses Policy:Payout-Approval.
  await store.upsertNode(
    node("Policy:pay.vendor", "Policy", "Pay vendor policy", {
      enabled: false,
      action: "pay.vendor",
      maxInPaise: 2500000,
      rules_json: JSON.stringify({
        action: "pay.vendor",
        effect: "require_approval",
        description:
          "Vendor payouts up to ₹25,000 require approval; only verified bank accounts.",
        rules: [
          { field: "amountInPaise", op: "lte", value: 2500000 },
          { field: "target.props.verified_bank", op: "truthy" },
        ],
      }),
    }),
  );
  await store.upsertNode(
    node(
      "Policy:pay.vendor.deny-overlimit",
      "Policy",
      "Deny vendor payouts over ₹25,000",
      {
        enabled: true,
        action: "pay.vendor",
        rules_json: JSON.stringify({
          action: "pay.vendor",
          effect: "deny",
          description: "Vendor payouts over ₹25,000 are denied.",
          rules: [{ field: "amountInPaise", op: "gte", value: 2500001 }],
        }),
      },
    ),
  );
  // Legacy collect.invoice autonomy kept disabled — authority UI uses Policy:Payment-Link-Approval.
  await store.upsertNode(
    node("Policy:collect.invoice", "Policy", "Collect invoice policy", {
      enabled: false,
      action: "collect.invoice",
      autonomy: false,
      rules_json: JSON.stringify({
        action: "collect.invoice",
        effect: "allow",
        description:
          "May send Payment Links autonomously for overdue B2B invoices.",
        rules: [
          {
            field: "target.props.status",
            op: "in",
            value: ["overdue", "sent"],
          },
        ],
      }),
    }),
  );
  await store.upsertNode(
    node("Policy:money.recovery", "Policy", "Money recovery policy", {
      enabled: true,
      action: "money.recovery",
      rules_json: JSON.stringify({
        action: "money.recovery",
        effect: "require_approval",
        description:
          "Payment recovery actions (retry, hold stock, release to lead) require operator approval.",
        rules: [{ field: "amountInPaise", op: "gte", value: 0 }],
      }),
    }),
  );
  // Legacy blanket PO policy kept disabled — replaced by threshold authority policies below.
  await store.upsertNode(
    node("Policy:po.create", "Policy", "Purchase order policy", {
      enabled: false,
      action: "po.create",
      rules_json: JSON.stringify({
        action: "po.create",
        effect: "require_approval",
        description: "All purchase orders require operator approval.",
        rules: [{ field: "amountInPaise", op: "gte", value: 0 }],
      }),
    }),
  );
  await store.upsertNode(
    node("Policy:PO-Auto-Under-50k", "Policy", "Auto-approve POs under ₹50,000", {
      enabled: true,
      action: "po.create",
      rules_json: JSON.stringify({
        action: "po.create",
        effect: "allow",
        description: "Purchase orders under ₹50,000 may be created automatically.",
        rules: [{ field: "amountInPaise", op: "lte", value: 5000000 }],
      }),
    }),
  );
  await store.upsertNode(
    node(
      "Policy:PO-Approve-Over-5L",
      "Policy",
      "Require approval for POs over ₹5,00,000",
      {
        enabled: true,
        action: "po.create",
        rules_json: JSON.stringify({
          action: "po.create",
          effect: "require_approval",
          description:
            "Purchase orders over ₹5,00,000 always require operator approval.",
          rules: [{ field: "amountInPaise", op: "gte", value: 50000000 }],
        }),
      },
    ),
  );
  await store.upsertNode(
    node("Policy:email.send", "Policy", "Email send policy", {
      enabled: true,
      action: "email.send",
      rules_json: JSON.stringify({
        action: "email.send",
        effect: "require_approval",
        description: "Outbound email sends always require operator approval.",
        rules: [{ field: "isDraft", op: "neq", value: true }],
      }),
    }),
  );
  await store.upsertNode(
    node(
      "Policy:Email-Auto-Draft",
      "Policy",
      "Auto-draft emails (approval needed to send)",
      {
        enabled: true,
        action: "email.send",
        rules_json: JSON.stringify({
          action: "email.send",
          effect: "allow",
          description:
            "Drafting emails is allowed automatically; sending still needs approval.",
          rules: [{ field: "isDraft", op: "eq", value: true }],
        }),
      },
    ),
  );
  await store.upsertNode(
    node(
      "Policy:Payment-Link-Approval",
      "Policy",
      "Require approval for payment links",
      {
        enabled: true,
        action: "collect.invoice",
        rules_json: JSON.stringify({
          action: "collect.invoice",
          effect: "require_approval",
          description: "Creating Razorpay payment links requires operator approval.",
          rules: [],
        }),
      },
    ),
  );
  await store.upsertNode(
    node("Policy:Payout-Approval", "Policy", "Require approval for vendor payouts", {
      enabled: true,
      action: "pay.vendor",
      rules_json: JSON.stringify({
        action: "pay.vendor",
        effect: "require_approval",
        description: "Vendor payouts require operator approval.",
        rules: [],
      }),
    }),
  );
  await store.upsertNode(
    node("Policy:listing.publish", "Policy", "Listing publish policy", {
      enabled: true,
      action: "listing.publish",
      rules_json: JSON.stringify({
        action: "listing.publish",
        effect: "require_approval",
        description: "Public listing publish always requires operator approval.",
        rules: [],
      }),
    }),
  );
  await store.upsertNode(
    node("Policy:so.accept", "Policy", "Accept sales order policy", {
      enabled: true,
      action: "so.accept",
      rules_json: JSON.stringify({
        action: "so.accept",
        effect: "allow",
        description: "Incoming sales orders may be accepted automatically.",
        rules: [],
      }),
    }),
  );

  await write("OWNS", anika._id, arka._id);
  await write("EMPLOYS", arka._id, rafi._id);
  await write("SUPPLIES", meenakshi._id, brass._id);
  await write("SUPPLIES", shreeMetal._id, brass._id);
  await write("SUPPLIES", jaipurAlloys._id, brass._id);
  await write("SUPPLIES", shreeMetal._id, brassRod._id);
  await write("SUPPLIES", jaipurAlloys._id, copperSheet._id);
  await write("SUPPLIES", meenakshi._id, juteCord._id);
  await write("SUPPLIES", jaipurAlloys._id, lacquer._id);

  // PO-104 late path (Meenakshi unreliable)
  await write("ORDER_CONTAINS", po104._id, brass._id, { qty: 40, uom: "kg" });
  await write("FULFILLS", in77._id, po104._id);
  await write("CONTACT_AT", meenakshi._id, po104._id);
  await write("SHIPS", in77._id, delhivery._id);

  // PO-105 delivered on time (Shree Metal rods)
  await write("ORDER_CONTAINS", po105._id, brassRod._id, { qty: 25, uom: "kg" });
  await write("CONTACT_AT", shreeMetal._id, po105._id);

  // PO-106 copper in transit
  await write("ORDER_CONTAINS", po106._id, copperSheet._id, { qty: 10, uom: "kg" });
  await write("FULFILLS", in78._id, po106._id);
  await write("CONTACT_AT", jaipurAlloys._id, po106._id);
  await write("SHIPS", in78._id, delhivery._id);

  // PO-107 draft — pending approval to Meenakshi (risk)
  await write("ORDER_CONTAINS", po107._id, brass._id, { qty: 60, uom: "kg" });
  await write("CONTACT_AT", meenakshi._id, po107._id);

  // PO-108 emergency brass for Rangoli SO-220
  await write("ORDER_CONTAINS", po108._id, brass._id, { qty: 50, uom: "kg" });
  await write("CONTACT_AT", shreeMetal._id, po108._id);

  await write("MADE_FROM", diya._id, brass._id, { qty: 0.35, uom: "kg" });
  await write("MADE_FROM", diyaSmall._id, brass._id, { qty: 0.18, uom: "kg" });
  await write("MADE_FROM", tray._id, brass._id, { qty: 0.55, uom: "kg" });
  await write("MADE_FROM", urli._id, brass._id, { qty: 0.9, uom: "kg" });
  await write("MADE_FROM", lamp._id, brass._id, { qty: 1.2, uom: "kg" });
  await write("MADE_FROM", incense._id, brass._id, { qty: 0.12, uom: "kg" });
  await write("MADE_FROM", bell._id, brassRod._id, { qty: 0.4, uom: "kg" });
  await write("MADE_FROM", thali._id, brass._id, { qty: 1.5, uom: "kg" });
  await write("MADE_FROM", candleStand._id, brassRod._id, { qty: 0.6, uom: "kg" });
  await write("MADE_FROM", lamp._id, copperSheet._id, { qty: 0.15, uom: "kg" });
  await write("MADE_FROM", urli._id, lacquer._id, { qty: 0.02, uom: "ltr" });

  await write("STOCK_OF", diyaStock._id, diya._id);
  await write("STOCK_OF", trayStock._id, tray._id);
  await write("STOCK_OF", diyaSmallStock._id, diyaSmall._id);
  await write("STOCK_OF", castBlankStock._id, castBlank._id);
  await write("STOCK_OF", urliStock._id, urli._id);
  await write("STOCK_OF", lampStock._id, lamp._id);
  await write("STOCK_OF", incenseStock._id, incense._id);
  await write("STOCK_OF", bellStock._id, bell._id);
  await write("STOCK_OF", thaliStock._id, thali._id);
  await write("STOCK_OF", candleStock._id, candleStand._id);

  await write("LOCATED_AT", diyaStock._id, workshop._id);
  await write("LOCATED_AT", trayStock._id, workshop._id);
  await write("LOCATED_AT", diyaSmallStock._id, workshop._id);
  await write("LOCATED_AT", castBlankStock._id, workshop._id);
  await write("LOCATED_AT", urliStock._id, workshop._id);
  await write("LOCATED_AT", lampStock._id, workshop._id);
  await write("LOCATED_AT", incenseStock._id, workshop._id);
  await write("LOCATED_AT", bellStock._id, workshop._id);
  await write("LOCATED_AT", thaliStock._id, workshop._id);
  await write("LOCATED_AT", candleStock._id, workshop._id);

  // Existing orders
  await write("ORDER_CONTAINS", so218._id, diya._id, { qty: 8 });
  await write("ORDER_CONTAINS", so201._id, tray._id, { qty: 1 });
  await write("BUYS", lotus._id, so218._id);
  await write("BUYS", diwaliBazaar._id, so201._id);
  await write("ABOUT", so218._id, po104._id);
  await write("INVOICES", inv90._id, so218._id);
  await write("PAYS", plink7._id, inv90._id);

  // SO-220 Rangoli surge → PO-108 brass story
  await write("ORDER_CONTAINS", so220._id, urli._id, { qty: 55 });
  await write("ORDER_CONTAINS", so220._id, diya._id, { qty: 20 });
  await write("BUYS", rangoli._id, so220._id);
  await write("ABOUT", so220._id, po108._id);

  // SO-221 Heritage premium — delivered + paid (₹2,75,000)
  await write("ORDER_CONTAINS", so221._id, thali._id, { qty: 30 });
  await write("ORDER_CONTAINS", so221._id, lamp._id, { qty: 20 });
  await write("BUYS", heritageGallery._id, so221._id);
  await write("FULFILLS", out44._id, so221._id);
  await write("SHIPS", out44._id, delhivery._id);
  await write("INVOICES", inv91._id, so221._id);
  await write("PAYS", pay91._id, inv91._id);

  // SO-222 Craft Central — shipped, invoice overdue
  await write("ORDER_CONTAINS", so222._id, tray._id, { qty: 10 });
  await write("BUYS", craftCentral._id, so222._id);
  await write("FULFILLS", out46._id, so222._id);
  await write("SHIPS", out46._id, delhivery._id);
  await write("INVOICES", inv93._id, so222._id);

  // SO-223 Artisan House first order — draft invoice (₹8,500)
  await write("ORDER_CONTAINS", so223._id, urli._id, { qty: 2 });
  await write("ORDER_CONTAINS", so223._id, incense._id, { qty: 2 });
  await write("BUYS", artisanHouse._id, so223._id);
  await write("INVOICES", inv95._id, so223._id);

  // SO-224 Diwali Bazaar D2C packing
  await write("ORDER_CONTAINS", so224._id, diyaSmall._id, { qty: 40 });
  await write("BUYS", diwaliBazaar._id, so224._id);
  await write("FULFILLS", out45._id, so224._id);
  await write("SHIPS", out45._id, delhivery._id);

  // SO-225 Rangoli bells — delivered, invoice due soon
  await write("ORDER_CONTAINS", so225._id, bell._id, { qty: 12 });
  await write("BUYS", rangoli._id, so225._id);
  await write("INVOICES", inv92._id, so225._id);
  await write("ABOUT", so225._id, po105._id);

  // SO-226 Lotus lamps — shipped + paid
  await write("ORDER_CONTAINS", so226._id, lamp._id, { qty: 4 });
  await write("BUYS", lotus._id, so226._id);
  await write("INVOICES", inv94._id, so226._id);
  await write("PAYS", pay94._id, inv94._id);

  // SO-227 cancelled
  await write("ORDER_CONTAINS", so227._id, candleStand._id, { qty: 6 });
  await write("BUYS", craftCentral._id, so227._id);

  // SO-228 Heritage candle stands packing
  await write("ORDER_CONTAINS", so228._id, candleStand._id, { qty: 8 });
  await write("BUYS", heritageGallery._id, so228._id);

  await write("SOURCED_FROM", lead._id, listing._id);
  await write("LISTS", listing._id, diya._id);
  await write("SOURCED_FROM", leadPriya._id, listingUrli._id);
  await write("LISTS", listingUrli._id, urli._id);
  await write("ABOUT", leadExhibition._id, meetingTradeShow._id);
  await write("ABOUT", leadKaran._id, heritageGallery._id);
  await write("ABOUT", leadNisha._id, thali._id);

  await write("ABOUT", meeting._id, po104._id);
  await write("ABOUT", meetingRangoli._id, so220._id);
  await write("ABOUT", meetingTradeShow._id, leadExhibition._id);
  await write("ABOUT", meetingBank._id, inv93._id);
  await write("ABOUT", message._id, po104._id);
  await write("CONTACT_AT", meenakshiContact._id, meenakshi._id);

  const now = new Date();
  const bomDocs = [
    {
      orgId: ORG,
      bomNo: "BOM-2026-0042",
      itemKey: "SKU:Diya-Large",
      itemName: "Diya-Large",
      quantity: 1,
      uom: "Nos",
      status: "active" as const,
      isDefault: true,
      lines: [
        {
          lineNo: 1,
          itemKey: "SKU:Cast-Blank-Diya-5in",
          itemName: "Cast Blank Diya 5in",
          itemType: "sub_assembly" as const,
          quantity: 1,
          uom: "Nos",
          ratePaise: 14500,
          amountPaise: 14500,
        },
        {
          lineNo: 2,
          itemKey: "Consumable:PolishCompound",
          itemName: "Brass Polish Compound",
          itemType: "consumable" as const,
          quantity: 0.008,
          uom: "Kg",
          ratePaise: 35000,
          amountPaise: 280,
        },
        {
          lineNo: 3,
          itemKey: "Consumable:Lacquer",
          itemName: "Lacquer Finish",
          itemType: "consumable" as const,
          quantity: 0.004,
          uom: "Ltr",
          ratePaise: 45000,
          amountPaise: 180,
        },
        {
          lineNo: 4,
          itemKey: "Material:WickStand",
          itemName: "Cotton Wick Stand",
          itemType: "raw_material" as const,
          quantity: 1,
          uom: "Nos",
          ratePaise: 350,
          amountPaise: 350,
        },
        {
          lineNo: 5,
          itemKey: "Packing:PackBox",
          itemName: "Pack Box",
          itemType: "packing" as const,
          quantity: 1,
          uom: "Nos",
          ratePaise: 800,
          amountPaise: 800,
        },
        {
          lineNo: 6,
          itemKey: "Packing:BubbleWrap",
          itemName: "Bubble Wrap",
          itemType: "packing" as const,
          quantity: 0.5,
          uom: "Mtr",
          ratePaise: 600,
          amountPaise: 300,
        },
      ],
      operations: [
        {
          sequence: 10,
          operationName: "Buffing",
          workCenter: "Finishing Cell",
          timeMinutes: 10,
          hourlyRatePaise: 16000,
          operatingCostPaise: 2667,
        },
        {
          sequence: 20,
          operationName: "Engraving",
          workCenter: "Engraving Bench",
          timeMinutes: 12,
          hourlyRatePaise: 20000,
          operatingCostPaise: 4000,
        },
        {
          sequence: 30,
          operationName: "QC & Pack",
          workCenter: "Packing Station",
          timeMinutes: 4,
          hourlyRatePaise: 12000,
          operatingCostPaise: 800,
        },
      ],
      rawMaterialCostPaise: 16410,
      operationCostPaise: 7467,
      totalCostPaise: 23877,
    },
    {
      orgId: ORG,
      bomNo: "BOM-2026-0038",
      itemKey: "SKU:Cast-Blank-Diya-5in",
      itemName: "Cast Blank Diya 5in",
      quantity: 1,
      uom: "Nos",
      status: "active" as const,
      isDefault: true,
      lines: [
        {
          lineNo: 1,
          itemKey: "Material:BrassSheet-22g",
          itemName: "Brass Sheet 22G",
          itemType: "raw_material" as const,
          quantity: 0.11,
          uom: "Kg",
          ratePaise: 68000,
          amountPaise: 7480,
        },
        {
          lineNo: 2,
          itemKey: "Material:BrassScrap",
          itemName: "Brass Scrap Recycled",
          itemType: "raw_material" as const,
          quantity: 0.02,
          uom: "Kg",
          ratePaise: 52000,
          amountPaise: 1040,
        },
        {
          lineNo: 3,
          itemKey: "Consumable:CastingSand",
          itemName: "Casting Sand",
          itemType: "consumable" as const,
          quantity: 0.6,
          uom: "Kg",
          ratePaise: 1200,
          amountPaise: 720,
        },
        {
          lineNo: 4,
          itemKey: "Consumable:MoldRelease",
          itemName: "Mold Release Powder",
          itemType: "consumable" as const,
          quantity: 0.005,
          uom: "Kg",
          ratePaise: 40000,
          amountPaise: 200,
        },
        {
          lineNo: 5,
          itemKey: "Consumable:LPG",
          itemName: "LPG Fuel",
          itemType: "consumable" as const,
          quantity: 0.015,
          uom: "Kg",
          ratePaise: 8000,
          amountPaise: 120,
        },
      ],
      operations: [
        {
          sequence: 10,
          operationName: "Sheet Cutting",
          workCenter: "Cutting Bay",
          timeMinutes: 3,
          hourlyRatePaise: 18000,
          operatingCostPaise: 900,
        },
        {
          sequence: 20,
          operationName: "Sand Casting",
          workCenter: "Foundry",
          timeMinutes: 8,
          hourlyRatePaise: 22000,
          operatingCostPaise: 2933,
        },
        {
          sequence: 30,
          operationName: "Trimming",
          workCenter: "Trim Bench",
          timeMinutes: 6,
          hourlyRatePaise: 15000,
          operatingCostPaise: 1500,
        },
      ],
      rawMaterialCostPaise: 9560,
      operationCostPaise: 5333,
      totalCostPaise: 14893,
    },
    {
      orgId: ORG,
      bomNo: "BOM-2026-0045",
      itemKey: "SKU:Diya-Small",
      itemName: "Diya-Small-3inch",
      quantity: 1,
      uom: "Nos",
      status: "draft" as const,
      isDefault: false,
      lines: [
        {
          lineNo: 1,
          itemKey: "SKU:Cast-Blank-Diya-3in",
          itemName: "Cast Blank Diya 3in",
          itemType: "sub_assembly" as const,
          quantity: 1,
          uom: "Nos",
          ratePaise: 8500,
          amountPaise: 8500,
        },
        {
          lineNo: 2,
          itemKey: "Consumable:PolishCompound",
          itemName: "Brass Polish Compound",
          itemType: "consumable" as const,
          quantity: 0.005,
          uom: "Kg",
          ratePaise: 35000,
          amountPaise: 175,
        },
        {
          lineNo: 3,
          itemKey: "Consumable:Lacquer",
          itemName: "Lacquer Finish",
          itemType: "consumable" as const,
          quantity: 0.002,
          uom: "Ltr",
          ratePaise: 45000,
          amountPaise: 90,
        },
        {
          lineNo: 4,
          itemKey: "Material:CottonWick",
          itemName: "Cotton Wick",
          itemType: "raw_material" as const,
          quantity: 1,
          uom: "Nos",
          ratePaise: 200,
          amountPaise: 200,
        },
        {
          lineNo: 5,
          itemKey: "Packing:KraftSleeve",
          itemName: "Kraft Sleeve",
          itemType: "packing" as const,
          quantity: 1,
          uom: "Nos",
          ratePaise: 335,
          amountPaise: 335,
        },
      ],
      operations: [
        {
          sequence: 10,
          operationName: "Buffing",
          workCenter: "Finishing Cell",
          timeMinutes: 8,
          hourlyRatePaise: 16000,
          operatingCostPaise: 2133,
        },
        {
          sequence: 20,
          operationName: "QC & Pack",
          workCenter: "Packing Station",
          timeMinutes: 3,
          hourlyRatePaise: 11340,
          operatingCostPaise: 567,
        },
      ],
      rawMaterialCostPaise: 9300,
      operationCostPaise: 2700,
      totalCostPaise: 12000,
    },
  ];

  for (const bom of bomDocs) {
    const existing = await db.collection("boms").findOne({
      orgId: ORG,
      bomNo: bom.bomNo,
    });
    const _id = typeof existing?._id === "string" ? existing._id : ulid();
    await db.collection("boms").replaceOne(
      { orgId: ORG, bomNo: bom.bomNo },
      {
        _id,
        ...bom,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      { upsert: true },
    );
  }

  const HOUR_MS = 3600000;
  const userSeeds: Array<{
    email: string;
    name: string;
    phone: string | null;
    roleIds: string[];
    status: "active" | "invited" | "disabled";
    lastActiveAt: Date | null;
    lastLoginAt: Date | null;
  }> = [
    {
      email: "meenakshi@arkaatelier.in",
      name: "Meenakshi Devi",
      phone: "+91 98765 43210",
      roleIds: ["admin"],
      status: "active",
      lastActiveAt: new Date(Date.now() - 2 * HOUR_MS),
      lastLoginAt: new Date(Date.now() - 2 * HOUR_MS),
    },
    {
      email: "rajesh@arkaatelier.in",
      name: "Rajesh Gupta",
      phone: "+91 98111 22001",
      roleIds: ["accountant"],
      status: "active",
      lastActiveAt: new Date(Date.now() - 1 * DAY_MS),
      lastLoginAt: new Date(Date.now() - 1 * DAY_MS),
    },
    {
      email: "suresh@arkaatelier.in",
      name: "Suresh Yadav",
      phone: "+91 98222 33445",
      roleIds: ["storekeeper"],
      status: "active",
      lastActiveAt: new Date(Date.now() - 4 * HOUR_MS),
      lastLoginAt: new Date(Date.now() - 4 * HOUR_MS),
    },
    {
      email: "ramesh@arkaatelier.in",
      name: "Ramesh Kumar",
      phone: "+91 98333 44556",
      roleIds: ["shop_supervisor"],
      status: "active",
      lastActiveAt: new Date(Date.now() - 0.5 * HOUR_MS),
      lastLoginAt: new Date(Date.now() - 0.5 * HOUR_MS),
    },
    {
      email: "priya@arkaatelier.in",
      name: "Priya Sharma",
      phone: "+91 98444 55667",
      roleIds: ["sales"],
      status: "active",
      lastActiveAt: new Date(Date.now() - 3 * HOUR_MS),
      lastLoginAt: new Date(Date.now() - 3 * HOUR_MS),
    },
    {
      email: "anita@arkaatelier.in",
      name: "Anita Singh",
      phone: null,
      roleIds: ["sales"],
      status: "invited",
      lastActiveAt: null,
      lastLoginAt: null,
    },
    {
      email: "vikash@arkaatelier.in",
      name: "Vikash Verma",
      phone: "+91 98555 66778",
      roleIds: ["shop_supervisor"],
      status: "active",
      lastActiveAt: new Date(Date.now() - 1 * DAY_MS),
      lastLoginAt: new Date(Date.now() - 1 * DAY_MS),
    },
    {
      email: "audit@example.com",
      name: "CA Audit",
      phone: null,
      roleIds: ["viewer"],
      status: "disabled",
      lastActiveAt: new Date(Date.now() - 30 * DAY_MS),
      lastLoginAt: new Date(Date.now() - 30 * DAY_MS),
    },
  ];

  for (const user of userSeeds) {
    const existing = await db.collection("users").findOne({
      orgId: ORG,
      email: user.email,
    });
    const _id = typeof existing?._id === "string" ? existing._id : ulid();
    await db.collection("users").replaceOne(
      { orgId: ORG, email: user.email },
      {
        _id,
        orgId: ORG,
        ...user,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      { upsert: true },
    );
  }

  const woDocs = [
    {
      orgId: ORG,
      woNo: "WO-2026-0187",
      itemKey: "SKU:Diya-Large",
      itemName: "Diya-Large",
      bomId: null as string | null,
      bomNo: "BOM-2026-0042",
      quantity: 500,
      uom: "Nos",
      producedQty: 320,
      processLossQty: 0,
      status: "in_progress" as const,
      priority: "urgent" as const,
      materialStatus: "partial" as const,
      materialNote: "Polish Compound running low",
      plannedStartDate: "2026-08-28",
      plannedEndDate: "2026-09-05",
      actualStartDate: "2026-08-28",
      actualEndDate: null as string | null,
      salesOrderKey: "SalesOrder:SO-218",
      materials: [
        {
          itemKey: "SKU:Cast-Blank-Diya-5in",
          itemName: "Cast Blank Diya 5in",
          requiredQty: 500,
          transferredQty: 500,
          consumedQty: 320,
          availableQty: 180,
          uom: "Nos",
          ratePaise: 14500,
        },
        {
          itemKey: "Consumable:PolishCompound",
          itemName: "Polish Compound",
          requiredQty: 12,
          transferredQty: 8,
          consumedQty: 7.5,
          availableQty: 0.5,
          uom: "Kg",
          ratePaise: 35000,
        },
        {
          itemKey: "Material:WickStand",
          itemName: "Cotton Wicks",
          requiredQty: 500,
          transferredQty: 500,
          consumedQty: 320,
          availableQty: 180,
          uom: "Nos",
          ratePaise: 350,
        },
        {
          itemKey: "Packing:PackBox",
          itemName: "Packaging Box-S",
          requiredQty: 500,
          transferredQty: 200,
          consumedQty: 0,
          availableQty: 200,
          uom: "Nos",
          ratePaise: 800,
        },
      ],
      jobCards: [
        {
          jcId: "jc_seed_442",
          jcNo: "JC-442",
          operationName: "Buffing & Polishing",
          workCenter: "Finishing Cell",
          assignedTo: null as string | null,
          status: "completed" as const,
          forQuantity: 500,
          completedQty: 500,
          timeMinutes: 1110,
        },
        {
          jcId: "jc_seed_443",
          jcNo: "JC-443",
          operationName: "Engraving",
          workCenter: "Engraving Bench",
          assignedTo: "Fatima B.",
          status: "wip" as const,
          forQuantity: 500,
          completedQty: 320,
          timeMinutes: 672,
        },
        {
          jcId: "jc_seed_444",
          jcNo: "JC-444",
          operationName: "QC & Pack",
          workCenter: "Packing Station",
          assignedTo: "Anita S.",
          status: "open" as const,
          forQuantity: 500,
          completedQty: 0,
          timeMinutes: 0,
        },
      ],
      plannedMaterialCostPaise: 18500000,
      actualMaterialCostPaise: 12240000 as number | null,
      plannedOperationCostPaise: 9500000,
      actualOperationCostPaise: 6840000 as number | null,
      totalCostPaise: 28000000,
    },
    {
      orgId: ORG,
      woNo: "WO-2026-0194",
      itemKey: "SKU:Cast-Blank-Diya-5in",
      itemName: "Cast Blank Diya 5in",
      bomId: null as string | null,
      bomNo: "BOM-2026-0038",
      quantity: 200,
      uom: "Nos",
      producedQty: 0,
      processLossQty: 0,
      status: "not_started" as const,
      priority: "normal" as const,
      materialStatus: "partial" as const,
      materialNote: "Brass Sheet short 4.2 Kg",
      plannedStartDate: "2026-09-08",
      plannedEndDate: "2026-09-12",
      actualStartDate: null as string | null,
      actualEndDate: null as string | null,
      salesOrderKey: null as string | null,
      materials: [
        {
          itemKey: "Material:BrassSheet-22g",
          itemName: "Brass Sheet",
          requiredQty: 28,
          transferredQty: 0,
          consumedQty: 0,
          availableQty: 23.8,
          uom: "Kg",
          ratePaise: 68000,
        },
        {
          itemKey: "Consumable:FluxPaste",
          itemName: "Flux Paste",
          requiredQty: 2,
          transferredQty: 0,
          consumedQty: 0,
          availableQty: 4.5,
          uom: "Kg",
          ratePaise: 12000,
        },
        {
          itemKey: "Consumable:SandMouldMix",
          itemName: "Sand Mould Mix",
          requiredQty: 40,
          transferredQty: 0,
          consumedQty: 0,
          availableQty: 52,
          uom: "Kg",
          ratePaise: 4500,
        },
      ],
      jobCards: [
        {
          jcId: "jc_seed_451",
          jcNo: "JC-451",
          operationName: "Casting",
          workCenter: "Foundry",
          assignedTo: null as string | null,
          status: "open" as const,
          forQuantity: 200,
          completedQty: 0,
          timeMinutes: 0,
        },
        {
          jcId: "jc_seed_452",
          jcNo: "JC-452",
          operationName: "Deburring",
          workCenter: "Finishing Cell",
          assignedTo: null as string | null,
          status: "open" as const,
          forQuantity: 200,
          completedQty: 0,
          timeMinutes: 0,
        },
      ],
      plannedMaterialCostPaise: 8400000,
      actualMaterialCostPaise: null as number | null,
      plannedOperationCostPaise: 3200000,
      actualOperationCostPaise: null as number | null,
      totalCostPaise: 11600000,
    },
    {
      orgId: ORG,
      woNo: "WO-2026-0156",
      itemKey: "SKU:Tray-Oval",
      itemName: "Tray-Oval",
      bomId: null as string | null,
      bomNo: null as string | null,
      quantity: 50,
      uom: "Nos",
      producedQty: 48,
      processLossQty: 2,
      status: "completed" as const,
      priority: "normal" as const,
      materialStatus: "available" as const,
      materialNote: null as string | null,
      plannedStartDate: "2026-07-14",
      plannedEndDate: "2026-07-22",
      actualStartDate: "2026-07-14",
      actualEndDate: "2026-07-21",
      salesOrderKey: "SalesOrder:SO-191",
      materials: [
        {
          itemKey: "Material:BrassSheet-Light",
          itemName: "Brass Sheet-Light",
          requiredQty: 6.5,
          transferredQty: 6.5,
          consumedQty: 6.4,
          availableQty: 0.1,
          uom: "Kg",
          ratePaise: 72000,
        },
        {
          itemKey: "Material:DiffuserFilm",
          itemName: "Diffuser Film",
          requiredQty: 50,
          transferredQty: 50,
          consumedQty: 48,
          availableQty: 2,
          uom: "Nos",
          ratePaise: 1200,
        },
        {
          itemKey: "Material:MountRing",
          itemName: "Mount Ring",
          requiredQty: 50,
          transferredQty: 50,
          consumedQty: 48,
          availableQty: 2,
          uom: "Nos",
          ratePaise: 800,
        },
      ],
      jobCards: [
        {
          jcId: "jc_seed_398",
          jcNo: "JC-398",
          operationName: "Spin Forming",
          workCenter: "Spinning Lathe",
          assignedTo: "Ravi K.",
          status: "completed" as const,
          forQuantity: 50,
          completedQty: 50,
          timeMinutes: 360,
        },
        {
          jcId: "jc_seed_399",
          jcNo: "JC-399",
          operationName: "Finish & Fit",
          workCenter: "Finishing Cell",
          assignedTo: "Anita S.",
          status: "completed" as const,
          forQuantity: 50,
          completedQty: 48,
          timeMinutes: 270,
        },
        {
          jcId: "jc_seed_400",
          jcNo: "JC-400",
          operationName: "QC",
          workCenter: "QC Bench",
          assignedTo: "Fatima B.",
          status: "completed" as const,
          forQuantity: 50,
          completedQty: 48,
          timeMinutes: 108,
        },
      ],
      plannedMaterialCostPaise: 1120000,
      actualMaterialCostPaise: 1185000 as number | null,
      plannedOperationCostPaise: 620000,
      actualOperationCostPaise: 660000 as number | null,
      totalCostPaise: 1740000,
    },
    {
      orgId: ORG,
      woNo: "WO-2026-0201",
      itemKey: "SKU:Diya-Small",
      itemName: "Diya-Small",
      bomId: null as string | null,
      bomNo: "BOM-2026-0045",
      quantity: 1000,
      uom: "Nos",
      producedQty: 0,
      processLossQty: 0,
      status: "draft" as const,
      priority: "normal" as const,
      materialStatus: "available" as const,
      materialNote: null as string | null,
      plannedStartDate: null as string | null,
      plannedEndDate: null as string | null,
      actualStartDate: null as string | null,
      actualEndDate: null as string | null,
      salesOrderKey: null as string | null,
      materials: [
        {
          itemKey: "SKU:Cast-Blank-Diya-3in",
          itemName: "Cast-Blank-Diya-3in",
          requiredQty: 1000,
          transferredQty: 0,
          consumedQty: 0,
          availableQty: 1200,
          uom: "Nos",
          ratePaise: 8500,
        },
        {
          itemKey: "Consumable:PolishCompound",
          itemName: "Polish Compound",
          requiredQty: 8,
          transferredQty: 0,
          consumedQty: 0,
          availableQty: 9.2,
          uom: "Kg",
          ratePaise: 35000,
        },
      ],
      jobCards: [] as Array<{
        jcId: string;
        jcNo: string;
        operationName: string;
        workCenter: string;
        assignedTo: string | null;
        status: "open" | "wip" | "completed" | "on_hold" | "cancelled";
        forQuantity: number;
        completedQty: number;
        timeMinutes: number;
      }>,
      plannedMaterialCostPaise: 22000000,
      actualMaterialCostPaise: null as number | null,
      plannedOperationCostPaise: 8500000,
      actualOperationCostPaise: null as number | null,
      totalCostPaise: 30500000,
    },
  ];

  for (const wo of woDocs) {
    const existing = await db.collection("work_orders").findOne({
      orgId: ORG,
      woNo: wo.woNo,
    });
    const _id =
      typeof existing?._id === "string" ? existing._id : `wo_${ulid()}`;
    await db.collection("work_orders").replaceOne(
      { orgId: ORG, woNo: wo.woNo },
      {
        _id,
        ...wo,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      { upsert: true },
    );
  }

  await seedMemories(db);

  const nodes = await store.listNodes(ORG);
  return { orgId: ORG, nodes: nodes.length, edges: edgeCount };
}

async function seedMemories(db: Db): Promise<void> {
  const demoMemories = [
    {
      kind: "preference" as const,
      subject: "Material:BrassSheet-22g",
      content:
        "Prefer Org:Shree-Metal-Works for brass sheets — verified quality, consistent 5-day lead time, fair pricing",
      tags: ["procurement", "vendor", "brass", "material"],
    },
    {
      kind: "override" as const,
      subject: "po.create",
      content:
        "Rejected PO over ₹5L without explicit CFO sign-off — company policy requires dual approval for large purchases",
      tags: ["procurement", "policy", "override"],
    },
    {
      kind: "decision" as const,
      subject: "Org:Rangoli-Retail",
      content:
        "Customer Rangoli Retail pays within 15 days when reminded by email — phone calls are less effective",
      tags: ["finance", "collections", "customer"],
    },
    {
      kind: "preference" as const,
      subject: "Material:JuteCord-2mm",
      content:
        "Jute cord from Org:Meenakshi-Brass has better tensile strength than alternatives — worth the 10% premium",
      tags: ["procurement", "material", "quality"],
    },
    {
      kind: "decision" as const,
      subject: "Invoice:INV-90",
      content:
        "For Lotus Boutique overdue invoices, send Payment Link first then follow up once by email after 48h",
      tags: ["finance", "collections", "customer"],
    },
  ];

  for (const mem of demoMemories) {
    const existing = await db.collection("agent_memories").findOne({
      orgId: ORG,
      subject: mem.subject,
      kind: mem.kind,
      content: mem.content,
    });
    if (existing) continue;
    await db.collection("agent_memories").insertOne({
      _id: `mem_${ulid()}`,
      orgId: ORG,
      kind: mem.kind,
      subject: mem.subject,
      content: mem.content,
      source: { type: "agent", actor: "seed" },
      tags: mem.tags,
      createdAt: new Date(),
      lastUsedAt: null,
      useCount: 0,
    } as never);
  }
}
