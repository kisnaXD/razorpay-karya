import { newEdgeId, newNodeId, type EdgeType, type NodeRecord } from "@karya/graph";
import { ulid } from "ulid";
import type { ToolContext } from "../types.js";

const MERCHANT_ORG_KEY = "Org:Arka-Atelier";
const WORKSHOP_LOCATION_KEY = "Location:Workshop";
const DAY_MS = 86400000;

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function propNumber(
  props: Record<string, string | number | boolean | null>,
  key: string,
): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

async function writeEdge(
  ctx: ToolContext,
  type: EdgeType,
  fromId: string,
  toId: string,
  props: Record<string, string | number | boolean | null> = {},
) {
  await ctx.store.writeEdge({
    _id: newEdgeId(),
    orgId: ctx.orgId,
    type,
    fromId,
    toId,
    props,
    validFrom: new Date(),
  });
}

export async function createCustomer(
  ctx: ToolContext,
  input: {
    name: string;
    city?: string;
    email?: string;
    phone?: string;
    notes?: string;
    explanation: string;
  },
) {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Customer name must contain alphanumeric characters");

  const nodeKey = `Org:${slug}`;
  const existing = await ctx.store.getNodeByKey(ctx.orgId, nodeKey);
  if (existing) {
    return {
      created: false,
      nodeKey: existing.key,
      label: existing.label,
      message: `Customer already exists as ${existing.key}`,
    };
  }

  const merchant = await ctx.store.getNodeByKey(ctx.orgId, MERCHANT_ORG_KEY);
  if (!merchant) {
    throw new Error(`Merchant org not found: ${MERCHANT_ORG_KEY}`);
  }

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Org",
    key: nodeKey,
    label: input.name.trim(),
    props: {
      role: "customer",
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.notes !== undefined ? { note: input.notes } : {}),
    },
  });

  // BUYS_FROM → BUYS (customer buys from merchant)
  await writeEdge(ctx, "BUYS", node._id, merchant._id);

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    label: node.label,
    message: `Created customer ${node.label} (${node.key}) linked to ${MERCHANT_ORG_KEY}`,
  };
}

export async function createVendor(
  ctx: ToolContext,
  input: {
    name: string;
    city?: string;
    email?: string;
    verified_bank?: boolean;
    materials?: string[];
    explanation: string;
  },
) {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Vendor name must contain alphanumeric characters");

  const nodeKey = `Org:${slug}`;
  const existing = await ctx.store.getNodeByKey(ctx.orgId, nodeKey);
  if (existing) {
    return {
      created: false,
      nodeKey: existing.key,
      label: existing.label,
      message: `Vendor already exists as ${existing.key}`,
    };
  }

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Org",
    key: nodeKey,
    label: input.name.trim(),
    props: {
      role: "vendor",
      verified_bank: input.verified_bank ?? false,
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    },
  });

  const linkedMaterials: string[] = [];
  for (const materialKey of input.materials ?? []) {
    const material = await ctx.store.getNodeByKey(ctx.orgId, materialKey);
    if (!material || material.type !== "Material") {
      throw new Error(`Material not found: ${materialKey}`);
    }
    await writeEdge(ctx, "SUPPLIES", node._id, material._id);
    linkedMaterials.push(material.key);
  }

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    label: node.label,
    materials: linkedMaterials,
    message: `Created vendor ${node.label} (${node.key})${
      linkedMaterials.length > 0
        ? ` supplying ${linkedMaterials.join(", ")}`
        : ""
    }`,
  };
}

export async function createInvoice(
  ctx: ToolContext,
  input: {
    invoiceNumber: string;
    customerOrgKey: string;
    amountInPaise: number;
    dueInDays?: number;
    items?: string;
    salesOrderKey?: string;
    explanation: string;
  },
) {
  const invoiceNumber = input.invoiceNumber.trim();
  const nodeKey = `Invoice:${invoiceNumber}`;
  const existing = await ctx.store.getNodeByKey(ctx.orgId, nodeKey);
  if (existing) {
    return {
      created: false,
      nodeKey: existing.key,
      label: existing.label,
      message: `Invoice already exists as ${existing.key}`,
    };
  }

  const customer = await ctx.store.getNodeByKey(
    ctx.orgId,
    input.customerOrgKey,
  );
  if (!customer || customer.type !== "Org") {
    throw new Error(`Customer org not found: ${input.customerOrgKey}`);
  }

  const dueInDays = input.dueInDays ?? 30;
  const dueAt = new Date(Date.now() + dueInDays * DAY_MS).toISOString();

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Invoice",
    key: nodeKey,
    label: invoiceNumber,
    props: {
      status: "sent",
      amountInPaise: input.amountInPaise,
      dueAt,
      nudge_count: 0,
      collections_state: "awaiting",
      customerOrgKey: input.customerOrgKey,
      ...(input.items !== undefined ? { items: input.items } : {}),
      ...(input.salesOrderKey !== undefined
        ? { salesOrderKey: input.salesOrderKey }
        : {}),
    },
  });

  // BILLED_TO → ABOUT (invoice billed to customer)
  await writeEdge(ctx, "ABOUT", node._id, customer._id);

  if (input.salesOrderKey) {
    const so = await ctx.store.getNodeByKey(ctx.orgId, input.salesOrderKey);
    if (!so || so.type !== "SalesOrder") {
      throw new Error(`Sales order not found: ${input.salesOrderKey}`);
    }
    // INVOICED_AS → INVOICES (invoice invoices sales order)
    await writeEdge(ctx, "INVOICES", node._id, so._id);
  }

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    label: node.label,
    amountInPaise: input.amountInPaise,
    dueAt,
    message: `Created invoice ${node.key} for ${input.customerOrgKey} (₹${(input.amountInPaise / 100).toLocaleString("en-IN")}) due ${dueAt.slice(0, 10)}`,
  };
}

export async function createSku(
  ctx: ToolContext,
  input: {
    name: string;
    priceInPaise: number;
    description?: string;
    gst?: number;
    lead_days?: number;
    materialKeys?: string[];
    explanation: string;
  },
) {
  const slug = slugify(input.name);
  if (!slug) throw new Error("SKU name must contain alphanumeric characters");

  const nodeKey = `SKU:${slug}`;
  const existing = await ctx.store.getNodeByKey(ctx.orgId, nodeKey);
  if (existing) {
    return {
      created: false,
      nodeKey: existing.key,
      label: existing.label,
      message: `SKU already exists as ${existing.key}`,
    };
  }

  const workshop = await ctx.store.getNodeByKey(
    ctx.orgId,
    WORKSHOP_LOCATION_KEY,
  );
  if (!workshop) {
    throw new Error(`Workshop location not found: ${WORKSHOP_LOCATION_KEY}`);
  }

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "SKU",
    key: nodeKey,
    label: input.name.trim(),
    props: {
      priceInPaise: input.priceInPaise,
      gst: input.gst ?? 12,
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.lead_days !== undefined ? { lead_days: input.lead_days } : {}),
    },
  });

  const linkedMaterials: string[] = [];
  for (const materialKey of input.materialKeys ?? []) {
    const material = await ctx.store.getNodeByKey(ctx.orgId, materialKey);
    if (!material || material.type !== "Material") {
      throw new Error(`Material not found: ${materialKey}`);
    }
    await writeEdge(ctx, "MADE_FROM", node._id, material._id);
    linkedMaterials.push(material.key);
  }

  const stockKey = `Stock:${slug}@Workshop`;
  const stock = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Stock",
    key: stockKey,
    label: `${input.name.trim()} @ Workshop`,
    props: {
      on_hand: 0,
      reserved: 0,
    },
  });

  await writeEdge(ctx, "STOCK_OF", stock._id, node._id);
  // AT → LOCATED_AT
  await writeEdge(ctx, "LOCATED_AT", stock._id, workshop._id);

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    stockKey: stock.key,
    label: node.label,
    materials: linkedMaterials,
    message: `Created SKU ${node.key} with stock ${stock.key}`,
  };
}

export async function createMaterial(
  ctx: ToolContext,
  input: {
    name: string;
    uom?: string;
    reorder_point?: number;
    explanation: string;
  },
) {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Material name must contain alphanumeric characters");

  const nodeKey = `Material:${slug}`;
  const existing = await ctx.store.getNodeByKey(ctx.orgId, nodeKey);
  if (existing) {
    return {
      created: false,
      nodeKey: existing.key,
      label: existing.label,
      message: `Material already exists as ${existing.key}`,
    };
  }

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Material",
    key: nodeKey,
    label: input.name.trim(),
    props: {
      uom: input.uom ?? "kg",
      ...(input.reorder_point !== undefined
        ? { reorder_point: input.reorder_point }
        : {}),
    },
  });

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    label: node.label,
    message: `Created material ${node.key}`,
  };
}

export async function createLead(
  ctx: ToolContext,
  input: {
    name: string;
    channel:
      | "instagram"
      | "whatsapp"
      | "email"
      | "website"
      | "referral"
      | "exhibition";
    notes?: string;
    skuInterest?: string;
    explanation: string;
  },
) {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Lead name must contain alphanumeric characters");

  const nodeKey = `Lead:${input.channel}-${slug}`;
  const existing = await ctx.store.getNodeByKey(ctx.orgId, nodeKey);
  if (existing) {
    return {
      created: false,
      nodeKey: existing.key,
      label: existing.label,
      message: `Lead already exists as ${existing.key}`,
    };
  }

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Lead",
    key: nodeKey,
    label: input.name.trim(),
    props: {
      channel: input.channel === "exhibition" ? "trade_show" : input.channel,
      status: "open",
      ...(input.notes !== undefined ? { note: input.notes } : {}),
      ...(input.skuInterest !== undefined
        ? { skuInterest: input.skuInterest }
        : {}),
    },
  });

  if (input.skuInterest) {
    const sku = await ctx.store.getNodeByKey(ctx.orgId, input.skuInterest);
    if (!sku || sku.type !== "SKU") {
      throw new Error(`SKU not found: ${input.skuInterest}`);
    }
    // INTERESTED_IN → ABOUT
    await writeEdge(ctx, "ABOUT", node._id, sku._id);
  }

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    label: node.label,
    message: `Created lead ${node.key}`,
  };
}

export async function createSalesOrder(
  ctx: ToolContext,
  input: {
    customerOrgKey: string;
    skuKey: string;
    qty: number;
    promiseDays?: number;
    channel?: "d2c" | "wholesale" | "marketplace";
    explanation: string;
  },
) {
  const customer = await ctx.store.getNodeByKey(
    ctx.orgId,
    input.customerOrgKey,
  );
  if (!customer || customer.type !== "Org") {
    throw new Error(`Customer org not found: ${input.customerOrgKey}`);
  }

  const sku = await ctx.store.getNodeByKey(ctx.orgId, input.skuKey);
  if (!sku || sku.type !== "SKU") {
    throw new Error(`SKU not found: ${input.skuKey}`);
  }

  const existingOrders = await ctx.store.listNodes(ctx.orgId, "SalesOrder");
  let maxNum = 0;
  for (const order of existingOrders) {
    const match = /SO-(\d+)/i.exec(order.key);
    if (match) {
      maxNum = Math.max(maxNum, Number.parseInt(match[1]!, 10));
    }
  }
  const nextNumber = maxNum + 1;
  const soLabel = `SO-${nextNumber}`;
  const nodeKey = `SalesOrder:${soLabel}`;

  const promiseDays = input.promiseDays ?? 7;
  const promiseDate = new Date(
    Date.now() + promiseDays * DAY_MS,
  ).toISOString();

  const hood = await ctx.store.neighborhood(ctx.orgId, sku._id, 1);
  const stockOfEdges = hood.edges.filter(
    (e) => e.type === "STOCK_OF" && e.toId === sku._id && e.validTo === null,
  );
  const stockNodes = hood.nodes.filter(
    (n) =>
      n.type === "Stock" && stockOfEdges.some((e) => e.fromId === n._id),
  );

  let available = 0;
  for (const stock of stockNodes) {
    available +=
      propNumber(stock.props, "on_hand") - propNumber(stock.props, "reserved");
  }

  let reserved = false;
  let reservedFrom: string | null = null;
  if (available >= input.qty && stockNodes.length > 0) {
    const stock = stockNodes[0]!;
    const nextReserved = propNumber(stock.props, "reserved") + input.qty;
    await ctx.store.upsertNode({
      _id: stock._id,
      orgId: stock.orgId,
      type: stock.type,
      key: stock.key,
      label: stock.label,
      props: {
        ...stock.props,
        reserved: nextReserved,
      },
    });
    reserved = true;
    reservedFrom = stock.key;
  }

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "SalesOrder",
    key: nodeKey,
    label: soLabel,
    props: {
      status: "promised",
      promise_date: promiseDate,
      qty: input.qty,
      orderedAt: new Date().toISOString(),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(reservedFrom ? { reserved_stock_key: reservedFrom } : {}),
    },
  });

  // PLACED_BY → BUYS (customer places/buys the order) — matches seed direction
  await writeEdge(ctx, "BUYS", customer._id, node._id);
  await writeEdge(ctx, "ORDER_CONTAINS", node._id, sku._id, {
    qty: input.qty,
  });

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    label: node.label,
    reserved,
    available,
    promiseDate,
    message: reserved
      ? `Created ${node.key} for ${input.qty}× ${sku.key}; reserved from ${reservedFrom}`
      : `Created ${node.key} for ${input.qty}× ${sku.key}; insufficient stock (available ${available}) — promised without reservation`,
  };
}

export async function recordPayment(
  ctx: ToolContext,
  input: {
    invoiceKey: string;
    amountInPaise: number;
    method:
      | "bank_transfer"
      | "upi"
      | "cheque"
      | "cash"
      | "payment_link";
    reference?: string;
    explanation: string;
  },
) {
  const invoice = await ctx.store.getNodeByKey(ctx.orgId, input.invoiceKey);
  if (!invoice || invoice.type !== "Invoice") {
    throw new Error(`Invoice not found: ${input.invoiceKey}`);
  }

  const paymentKey = `Payment:pay_${ulid().toLowerCase()}`;
  const paidAt = new Date().toISOString();

  const payment = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Payment",
    key: paymentKey,
    label: paymentKey.replace("Payment:", ""),
    props: {
      status: "captured",
      channel: input.method,
      method: input.method,
      amountInPaise: input.amountInPaise,
      paidAt,
      ...(input.reference !== undefined ? { reference: input.reference } : {}),
    },
  });

  await writeEdge(ctx, "PAYS", payment._id, invoice._id);

  const invoiceAmount = propNumber(invoice.props, "amountInPaise");
  let invoiceStatus = String(invoice.props.status ?? "sent");
  if (input.amountInPaise >= invoiceAmount && invoiceAmount > 0) {
    invoiceStatus = "paid";
    await ctx.store.upsertNode({
      _id: invoice._id,
      orgId: invoice.orgId,
      type: invoice.type,
      key: invoice.key,
      label: invoice.label,
      props: {
        ...invoice.props,
        status: "paid",
        paidAt,
        collections_state: "paid",
      },
    });
  }

  void input.explanation;
  return {
    created: true,
    nodeKey: payment.key,
    label: payment.label,
    invoiceKey: invoice.key,
    invoiceStatus,
    message:
      invoiceStatus === "paid"
        ? `Recorded payment ${payment.key}; invoice ${invoice.key} marked paid`
        : `Recorded payment ${payment.key} of ${input.amountInPaise} paise against ${invoice.key} (status remains ${invoiceStatus})`,
  };
}

export async function createMeeting(
  ctx: ToolContext,
  input: {
    title: string;
    startsAt: string;
    attendeeOrgKey?: string;
    notes?: string;
    explanation: string;
  },
) {
  const slug = slugify(input.title);
  if (!slug) throw new Error("Meeting title must contain alphanumeric characters");

  const nodeKey = `Meeting:${slug}`;
  const existing = await ctx.store.getNodeByKey(ctx.orgId, nodeKey);
  if (existing) {
    return {
      created: false,
      nodeKey: existing.key,
      label: existing.label,
      message: `Meeting already exists as ${existing.key}`,
    };
  }

  const node = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Meeting",
    key: nodeKey,
    label: input.title.trim(),
    props: {
      startsAt: input.startsAt,
      ...(input.attendeeOrgKey !== undefined
        ? { attendeeOrgKey: input.attendeeOrgKey }
        : {}),
      ...(input.notes !== undefined ? { note: input.notes } : {}),
    },
  });

  if (input.attendeeOrgKey) {
    const attendee = await ctx.store.getNodeByKey(
      ctx.orgId,
      input.attendeeOrgKey,
    );
    if (!attendee) {
      throw new Error(`Attendee org not found: ${input.attendeeOrgKey}`);
    }
    await writeEdge(ctx, "ABOUT", node._id, attendee._id);
  }

  void input.explanation;
  return {
    created: true,
    nodeKey: node.key,
    label: node.label,
    message: `Scheduled meeting ${node.key} at ${input.startsAt}`,
  };
}

export async function updateNode(
  ctx: ToolContext,
  input: {
    nodeKey: string;
    updates: Record<string, string | number | boolean | null>;
    explanation: string;
  },
) {
  const node = await ctx.store.getNodeByKey(ctx.orgId, input.nodeKey);
  if (!node) {
    throw new Error(`Node not found: ${input.nodeKey}`);
  }

  const updated: NodeRecord = await ctx.store.upsertNode({
    _id: node._id,
    orgId: node.orgId,
    type: node.type,
    key: node.key,
    label: node.label,
    props: {
      ...node.props,
      ...input.updates,
    },
  });

  void input.explanation;
  return {
    created: false,
    updated: true,
    nodeKey: updated.key,
    label: updated.label,
    props: updated.props,
    message: `Updated ${updated.key}: ${Object.keys(input.updates).join(", ")}`,
  };
}
