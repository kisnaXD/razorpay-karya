import type { Db } from "mongodb";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";
import type { ProposedAction } from "@karya/policy";
import {
  buildDraftPreview,
  type DraftPurchaseOrderPreview,
} from "@karya/agents";
import { createApproval, getApproval, listReservedPoKeys } from "./approvals.js";
import { writeAuditEvent } from "./audit.js";

export type DraftPurchaseOrderInput = {
  orgId: string;
  vendorOrgKey: string;
  materialKey: string;
  qtyKg: number;
  reasonSalesOrderKeys?: string[];
  expectedAtDays?: number;
  explanation: string;
  proposedBy?: "agent:sourcing" | string;
};

function nextShipmentKey(nodes: NodeRecord[]): string {
  let max = 77;
  for (const n of nodes) {
    if (n.type !== "Shipment") continue;
    const m = /^Shipment:IN-(\d+)$/.exec(n.key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Shipment:IN-${max + 1}`;
}

export async function draftPurchaseOrder(
  db: Db,
  store: GraphStore,
  input: DraftPurchaseOrderInput,
): Promise<{ approvalId: string; preview: DraftPurchaseOrderPreview }> {
  const reservedPoKeys = await listReservedPoKeys(db, input.orgId);
  const preview = await buildDraftPreview(store, {
    orgId: input.orgId,
    vendorOrgKey: input.vendorOrgKey,
    materialKey: input.materialKey,
    qtyKg: input.qtyKg,
    ...(input.reasonSalesOrderKeys
      ? { reasonSalesOrderKeys: input.reasonSalesOrderKeys }
      : {}),
    ...(input.expectedAtDays !== undefined
      ? { expectedAtDays: input.expectedAtDays }
      : {}),
    explanation: input.explanation,
    reservedPoKeys,
  });

  const proposed: ProposedAction = {
    action: "po.create",
    orgId: input.orgId,
    targetNodeKey: input.vendorOrgKey,
    amountInPaise: preview.estimatedTotalInPaise,
    explanation: preview.why,
    proposedBy: input.proposedBy ?? "agent:sourcing",
    metadata: {
      materialKey: input.materialKey,
      qtyKg: input.qtyKg,
      poKey: preview.poKey,
      expectedAt: preview.expectedAt,
      reasonSalesOrderKeys: input.reasonSalesOrderKeys
        ? JSON.stringify(input.reasonSalesOrderKeys)
        : null,
      vendorLabel: preview.vendorLabel,
      materialLabel: preview.materialLabel,
      why: preview.why,
    },
  };

  const created = await createApproval(db, store, input.orgId, proposed);
  if ("autoAllowed" in created) {
    // Step 8 policy always requires approval — treat as error if misconfigured.
    throw new Error("po.create unexpectedly auto-allowed");
  }

  return { approvalId: created.approval._id, preview };
}

export async function commitPurchaseOrderFromProposed(
  store: GraphStore,
  orgId: string,
  proposed: ProposedAction,
  resolvedBy: string,
): Promise<{ poKey: string; shipmentKey: string }> {
  const meta = proposed.metadata ?? {};
  const poKey = String(meta.poKey ?? "");
  const materialKey = String(meta.materialKey ?? "");
  const qtyKg = Number(meta.qtyKg ?? 0);
  const expectedAt = String(meta.expectedAt ?? new Date().toISOString());
  const vendorOrgKey = proposed.targetNodeKey ?? "";

  if (!poKey || !materialKey || !vendorOrgKey || !(qtyKg > 0)) {
    throw new Error("po.create approval missing required metadata");
  }

  const material = await store.getNodeByKey(orgId, materialKey);
  if (!material || material.type !== "Material") {
    throw new Error(`Material not found: ${materialKey}`);
  }
  const vendor = await store.getNodeByKey(orgId, vendorOrgKey);
  if (!vendor || vendor.type !== "Org") {
    throw new Error(`Vendor not found: ${vendorOrgKey}`);
  }

  const amountInPaise = proposed.amountInPaise ?? 0;
  const poLabel = poKey.includes(":") ? poKey.split(":")[1]! : poKey;

  const po = await store.upsertNode({
    _id: newNodeId(),
    orgId,
    type: "PurchaseOrder",
    key: poKey,
    label: poLabel,
    props: {
      status: "open",
      expectedAt,
      qty: qtyKg,
      amountInPaise,
      vendor_key: vendorOrgKey,
      material_key: materialKey,
    },
  });

  const edges = await store.listEdges(orgId);
  const hasSupplies = edges.some(
    (e) =>
      e.type === "SUPPLIES" &&
      e.fromId === vendor._id &&
      e.toId === material._id &&
      e.validTo === null,
  );
  if (!hasSupplies) {
    await store.writeEdge({
      _id: newEdgeId(),
      orgId,
      type: "SUPPLIES",
      fromId: vendor._id,
      toId: material._id,
      props: {},
      validFrom: new Date(),
    });
  }

  await store.writeEdge({
    _id: newEdgeId(),
    orgId,
    type: "ORDER_CONTAINS",
    fromId: po._id,
    toId: material._id,
    props: { qty: qtyKg, uom: "kg" },
    validFrom: new Date(),
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId,
    type: "CONTACT_AT",
    fromId: vendor._id,
    toId: po._id,
    props: {},
    validFrom: new Date(),
  });

  const nodes = await store.listNodes(orgId);
  const shipmentKey = nextShipmentKey(nodes);
  const shipLabel = shipmentKey.includes(":")
    ? shipmentKey.split(":")[1]!
    : shipmentKey;

  const shipment = await store.upsertNode({
    _id: newNodeId(),
    orgId,
    type: "Shipment",
    key: shipmentKey,
    label: shipLabel,
    props: {
      direction: "inbound",
      status: "expected",
    },
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId,
    type: "FULFILLS",
    fromId: shipment._id,
    toId: po._id,
    props: {},
    validFrom: new Date(),
  });

  await writeAuditEvent(store, {
    orgId,
    eventType: "po.created",
    actor: resolvedBy,
    sideEffectClass: "write",
    payload: {
      poKey,
      shipmentKey,
      vendorOrgKey,
      materialKey,
      qtyKg,
      amountInPaise,
    },
    aboutNodeIds: [po._id, shipment._id],
  });

  return { poKey, shipmentKey };
}

export async function commitPurchaseOrder(
  db: Db,
  store: GraphStore,
  orgId: string,
  approvalId: string,
  resolvedBy: string,
): Promise<{ poKey: string; shipmentKey: string }> {
  const approval = await getApproval(db, orgId, approvalId);
  if (!approval) {
    throw new Error(`Approval not found: ${approvalId}`);
  }
  if (approval.proposedAction.action !== "po.create") {
    throw new Error(`Approval ${approvalId} is not po.create`);
  }
  return commitPurchaseOrderFromProposed(
    store,
    orgId,
    approval.proposedAction,
    resolvedBy,
  );
}
