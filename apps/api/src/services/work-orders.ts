import type { Db } from "mongodb";
import { ulid } from "ulid";

export type WoStatus =
  | "draft"
  | "not_started"
  | "in_progress"
  | "completed"
  | "stopped"
  | "cancelled";

export type MaterialStatus = "available" | "partial" | "not_available";
export type Priority = "low" | "normal" | "high" | "urgent";
export type JobCardStatus =
  | "open"
  | "wip"
  | "completed"
  | "on_hold"
  | "cancelled";

export type WoMaterialLine = {
  itemKey: string;
  itemName: string;
  requiredQty: number;
  transferredQty: number;
  consumedQty: number;
  availableQty: number;
  uom: string;
  ratePaise: number;
};

export type WoJobCard = {
  jcId: string;
  jcNo: string;
  operationName: string;
  workCenter: string;
  assignedTo: string | null;
  status: JobCardStatus;
  forQuantity: number;
  completedQty: number;
  timeMinutes: number;
};

export type WoRecord = {
  _id: string;
  orgId: string;
  woNo: string;
  itemKey: string;
  itemName: string;
  bomId: string | null;
  bomNo: string | null;
  quantity: number;
  uom: string;
  producedQty: number;
  processLossQty: number;
  status: WoStatus;
  priority: Priority;
  materialStatus: MaterialStatus;
  materialNote: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  salesOrderKey: string | null;
  materials: WoMaterialLine[];
  jobCards: WoJobCard[];
  plannedMaterialCostPaise: number;
  actualMaterialCostPaise: number | null;
  plannedOperationCostPaise: number;
  actualOperationCostPaise: number | null;
  totalCostPaise: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateWorkOrderInput = {
  itemKey: string;
  itemName: string;
  bomId?: string | null;
  bomNo?: string | null;
  quantity: number;
  uom?: string;
  priority?: Priority;
  materialStatus?: MaterialStatus;
  materialNote?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  salesOrderKey?: string | null;
  materials?: WoMaterialLine[];
  jobCards?: WoJobCard[];
  plannedMaterialCostPaise?: number;
  plannedOperationCostPaise?: number;
};

export type ListWorkOrdersFilter = {
  status?: WoStatus;
  priority?: Priority;
};

export class WorkOrderNotFoundError extends Error {
  constructor(woId: string) {
    super(`work_order_not_found:${woId}`);
    this.name = "WorkOrderNotFoundError";
  }
}

export class InvalidWoStatusTransitionError extends Error {
  constructor(from: WoStatus, to: WoStatus) {
    super(`invalid_wo_status_transition:${from}->${to}`);
    this.name = "InvalidWoStatusTransitionError";
  }
}

export class JobCardNotFoundError extends Error {
  constructor(jcId: string) {
    super(`job_card_not_found:${jcId}`);
    this.name = "JobCardNotFoundError";
  }
}

export class InvalidJobCardStatusTransitionError extends Error {
  constructor(from: JobCardStatus, to: JobCardStatus) {
    super(`invalid_job_card_status_transition:${from}->${to}`);
    this.name = "InvalidJobCardStatusTransitionError";
  }
}

const WO_TRANSITIONS: Record<WoStatus, readonly WoStatus[]> = {
  draft: ["not_started", "cancelled"],
  not_started: ["in_progress", "stopped", "cancelled"],
  in_progress: ["completed", "stopped", "cancelled"],
  stopped: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

const JC_TRANSITIONS: Record<JobCardStatus, readonly JobCardStatus[]> = {
  open: ["wip", "on_hold", "cancelled"],
  wip: ["completed", "on_hold", "cancelled"],
  on_hold: ["open", "wip", "cancelled"],
  completed: [],
  cancelled: [],
};

function collection(db: Db) {
  return db.collection<WoRecord>("work_orders");
}

export async function ensureWorkOrderIndexes(db: Db): Promise<void> {
  await collection(db).createIndex({ orgId: 1, woNo: 1 }, { unique: true });
  await collection(db).createIndex({ orgId: 1, status: 1 });
}

export async function listWorkOrders(
  db: Db,
  orgId: string,
  filter?: ListWorkOrdersFilter,
): Promise<WoRecord[]> {
  const query: {
    orgId: string;
    status?: WoStatus;
    priority?: Priority;
  } = { orgId };
  if (filter?.status) query.status = filter.status;
  if (filter?.priority) query.priority = filter.priority;
  return collection(db)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getWorkOrder(
  db: Db,
  orgId: string,
  woId: string,
): Promise<WoRecord | null> {
  return collection(db).findOne({ _id: woId, orgId });
}

async function nextWoNo(db: Db, orgId: string, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = `WO-${year}-`;
  const latest = await collection(db)
    .find({ orgId, woNo: { $regex: `^${prefix}` } })
    .sort({ woNo: -1 })
    .limit(1)
    .toArray();
  const last = latest[0]?.woNo;
  const seq = last ? Number.parseInt(last.slice(prefix.length), 10) + 1 : 1;
  const n = Number.isFinite(seq) && seq > 0 ? seq : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function createWorkOrder(
  db: Db,
  orgId: string,
  input: CreateWorkOrderInput,
): Promise<WoRecord> {
  const now = new Date();
  const plannedMaterial = input.plannedMaterialCostPaise ?? 0;
  const plannedOperation = input.plannedOperationCostPaise ?? 0;
  const record: WoRecord = {
    _id: `wo_${ulid()}`,
    orgId,
    woNo: await nextWoNo(db, orgId, now),
    itemKey: input.itemKey,
    itemName: input.itemName,
    bomId: input.bomId ?? null,
    bomNo: input.bomNo ?? null,
    quantity: input.quantity,
    uom: input.uom ?? "Nos",
    producedQty: 0,
    processLossQty: 0,
    status: "draft",
    priority: input.priority ?? "normal",
    materialStatus: input.materialStatus ?? "available",
    materialNote: input.materialNote ?? null,
    plannedStartDate: input.plannedStartDate ?? null,
    plannedEndDate: input.plannedEndDate ?? null,
    actualStartDate: null,
    actualEndDate: null,
    salesOrderKey: input.salesOrderKey ?? null,
    materials: input.materials ?? [],
    jobCards: input.jobCards ?? [],
    plannedMaterialCostPaise: plannedMaterial,
    actualMaterialCostPaise: null,
    plannedOperationCostPaise: plannedOperation,
    actualOperationCostPaise: null,
    totalCostPaise: plannedMaterial + plannedOperation,
    createdAt: now,
    updatedAt: now,
  };
  await collection(db).insertOne(record);
  return record;
}

export async function updateWorkOrderStatus(
  db: Db,
  orgId: string,
  woId: string,
  newStatus: WoStatus,
): Promise<WoRecord> {
  const existing = await getWorkOrder(db, orgId, woId);
  if (!existing) throw new WorkOrderNotFoundError(woId);

  if (existing.status === newStatus) return existing;

  const allowed = WO_TRANSITIONS[existing.status];
  if (!allowed.includes(newStatus)) {
    throw new InvalidWoStatusTransitionError(existing.status, newStatus);
  }

  const now = new Date();
  const patch: Partial<WoRecord> = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === "in_progress" && !existing.actualStartDate) {
    patch.actualStartDate = now.toISOString().slice(0, 10);
  }
  if (newStatus === "completed") {
    patch.actualEndDate = now.toISOString().slice(0, 10);
    if (existing.producedQty <= 0) {
      patch.producedQty = existing.quantity;
    }
  }

  const result = await collection(db).findOneAndUpdate(
    { _id: woId, orgId },
    { $set: patch },
    { returnDocument: "after" },
  );
  if (!result) throw new WorkOrderNotFoundError(woId);
  return result;
}

export async function updateJobCardStatus(
  db: Db,
  orgId: string,
  woId: string,
  jcId: string,
  newStatus: JobCardStatus,
  completedQty?: number,
): Promise<WoRecord> {
  const existing = await getWorkOrder(db, orgId, woId);
  if (!existing) throw new WorkOrderNotFoundError(woId);

  const idx = existing.jobCards.findIndex((jc) => jc.jcId === jcId);
  if (idx < 0) throw new JobCardNotFoundError(jcId);

  const jc = existing.jobCards[idx]!;
  if (jc.status !== newStatus) {
    const allowed = JC_TRANSITIONS[jc.status];
    if (!allowed.includes(newStatus)) {
      throw new InvalidJobCardStatusTransitionError(jc.status, newStatus);
    }
  }

  const updatedCards = existing.jobCards.map((card, i) => {
    if (i !== idx) return card;
    const next: WoJobCard = {
      ...card,
      status: newStatus,
    };
    if (completedQty !== undefined) {
      next.completedQty = completedQty;
    } else if (newStatus === "completed") {
      next.completedQty = card.forQuantity;
    }
    return next;
  });

  const now = new Date();
  const result = await collection(db).findOneAndUpdate(
    { _id: woId, orgId },
    {
      $set: {
        jobCards: updatedCards,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new WorkOrderNotFoundError(woId);
  return result;
}
