import type { Db } from "mongodb";
import { ulid } from "ulid";

export type BomLine = {
  lineNo: number;
  itemKey: string;
  itemName: string;
  itemType: "raw_material" | "sub_assembly" | "consumable" | "packing";
  quantity: number;
  uom: string;
  ratePaise: number;
  amountPaise: number;
};

export type BomOperation = {
  sequence: number;
  operationName: string;
  workCenter: string;
  timeMinutes: number;
  hourlyRatePaise: number;
  operatingCostPaise: number;
};

export type BomStatus = "draft" | "active" | "inactive";

export type BomRecord = {
  _id: string;
  orgId: string;
  bomNo: string;
  itemKey: string;
  itemName: string;
  quantity: number;
  uom: string;
  status: BomStatus;
  isDefault: boolean;
  lines: BomLine[];
  operations: BomOperation[];
  rawMaterialCostPaise: number;
  operationCostPaise: number;
  totalCostPaise: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateBomInput = {
  itemKey: string;
  itemName: string;
  quantity?: number;
  uom?: string;
  isDefault?: boolean;
  lines?: BomLine[];
  operations?: BomOperation[];
  rawMaterialCostPaise?: number;
  operationCostPaise?: number;
  totalCostPaise?: number;
};

export type UpdateBomInput = Partial<{
  itemKey: string;
  itemName: string;
  quantity: number;
  uom: string;
  isDefault: boolean;
  lines: BomLine[];
  operations: BomOperation[];
  rawMaterialCostPaise: number;
  operationCostPaise: number;
  totalCostPaise: number;
}>;

function collection(db: Db) {
  return db.collection<BomRecord>("boms");
}

function sumLines(lines: BomLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountPaise, 0);
}

function sumOps(operations: BomOperation[]): number {
  return operations.reduce((sum, op) => sum + op.operatingCostPaise, 0);
}

function withCosts(
  lines: BomLine[],
  operations: BomOperation[],
  overrides?: {
    rawMaterialCostPaise?: number;
    operationCostPaise?: number;
    totalCostPaise?: number;
  },
): Pick<
  BomRecord,
  "rawMaterialCostPaise" | "operationCostPaise" | "totalCostPaise"
> {
  const rawMaterialCostPaise =
    overrides?.rawMaterialCostPaise ?? sumLines(lines);
  const operationCostPaise =
    overrides?.operationCostPaise ?? sumOps(operations);
  const totalCostPaise =
    overrides?.totalCostPaise ?? rawMaterialCostPaise + operationCostPaise;
  return { rawMaterialCostPaise, operationCostPaise, totalCostPaise };
}

async function nextBomNo(db: Db, orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BOM-${year}-`;
  const existing = await collection(db)
    .find({ orgId, bomNo: { $regex: `^${prefix}` } })
    .project({ bomNo: 1 })
    .toArray();
  let max = 0;
  for (const doc of existing) {
    const m = /^BOM-\d{4}-(\d+)$/.exec(doc.bomNo);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function ensureBomIndexes(db: Db): Promise<void> {
  await collection(db).createIndex({ orgId: 1, bomNo: 1 }, { unique: true });
  await collection(db).createIndex({ orgId: 1, itemKey: 1, status: 1 });
}

export async function listBoms(
  db: Db,
  orgId: string,
  filter?: { status?: BomStatus },
): Promise<BomRecord[]> {
  const query: { orgId: string; status?: BomStatus } = { orgId };
  if (filter?.status) query.status = filter.status;
  return collection(db).find(query).sort({ bomNo: -1 }).toArray();
}

export async function getBom(
  db: Db,
  orgId: string,
  bomId: string,
): Promise<BomRecord | null> {
  return collection(db).findOne({ _id: bomId, orgId });
}

export async function createBom(
  db: Db,
  orgId: string,
  input: CreateBomInput,
): Promise<BomRecord> {
  const now = new Date();
  const lines = input.lines ?? [];
  const operations = input.operations ?? [];
  const costs = withCosts(lines, operations, {
    ...(input.rawMaterialCostPaise !== undefined
      ? { rawMaterialCostPaise: input.rawMaterialCostPaise }
      : {}),
    ...(input.operationCostPaise !== undefined
      ? { operationCostPaise: input.operationCostPaise }
      : {}),
    ...(input.totalCostPaise !== undefined
      ? { totalCostPaise: input.totalCostPaise }
      : {}),
  });

  const record: BomRecord = {
    _id: ulid(),
    orgId,
    bomNo: await nextBomNo(db, orgId),
    itemKey: input.itemKey,
    itemName: input.itemName,
    quantity: input.quantity ?? 1,
    uom: input.uom ?? "Nos",
    status: "draft",
    isDefault: input.isDefault ?? false,
    lines,
    operations,
    ...costs,
    createdAt: now,
    updatedAt: now,
  };

  await collection(db).insertOne(record);
  return record;
}

export async function updateBom(
  db: Db,
  orgId: string,
  bomId: string,
  updates: UpdateBomInput,
): Promise<BomRecord> {
  const existing = await getBom(db, orgId, bomId);
  if (!existing) throw new BomNotFoundError(bomId);
  if (existing.status !== "draft") {
    throw new BomNotEditableError(bomId);
  }

  const lines = updates.lines ?? existing.lines;
  const operations = updates.operations ?? existing.operations;
  const costs = withCosts(lines, operations, {
    ...(updates.rawMaterialCostPaise !== undefined
      ? { rawMaterialCostPaise: updates.rawMaterialCostPaise }
      : updates.lines
        ? {}
        : { rawMaterialCostPaise: existing.rawMaterialCostPaise }),
    ...(updates.operationCostPaise !== undefined
      ? { operationCostPaise: updates.operationCostPaise }
      : updates.operations
        ? {}
        : { operationCostPaise: existing.operationCostPaise }),
    ...(updates.totalCostPaise !== undefined
      ? { totalCostPaise: updates.totalCostPaise }
      : updates.lines || updates.operations
        ? {}
        : { totalCostPaise: existing.totalCostPaise }),
  });

  const updated: BomRecord = {
    ...existing,
    ...(updates.itemKey !== undefined ? { itemKey: updates.itemKey } : {}),
    ...(updates.itemName !== undefined ? { itemName: updates.itemName } : {}),
    ...(updates.quantity !== undefined ? { quantity: updates.quantity } : {}),
    ...(updates.uom !== undefined ? { uom: updates.uom } : {}),
    ...(updates.isDefault !== undefined ? { isDefault: updates.isDefault } : {}),
    lines,
    operations,
    ...costs,
    updatedAt: new Date(),
  };

  await collection(db).replaceOne({ _id: bomId, orgId }, updated);
  return updated;
}

export async function activateBom(
  db: Db,
  orgId: string,
  bomId: string,
): Promise<BomRecord> {
  const existing = await getBom(db, orgId, bomId);
  if (!existing) throw new BomNotFoundError(bomId);

  const updated: BomRecord = {
    ...existing,
    status: "active",
    updatedAt: new Date(),
  };
  await collection(db).replaceOne({ _id: bomId, orgId }, updated);
  return updated;
}

export async function deactivateBom(
  db: Db,
  orgId: string,
  bomId: string,
): Promise<BomRecord> {
  const existing = await getBom(db, orgId, bomId);
  if (!existing) throw new BomNotFoundError(bomId);

  const updated: BomRecord = {
    ...existing,
    status: "inactive",
    updatedAt: new Date(),
  };
  await collection(db).replaceOne({ _id: bomId, orgId }, updated);
  return updated;
}

export class BomNotFoundError extends Error {
  constructor(id: string) {
    super(`BOM not found: ${id}`);
    this.name = "BomNotFoundError";
  }
}

export class BomNotEditableError extends Error {
  constructor(id: string) {
    super(`BOM is not editable (not draft): ${id}`);
    this.name = "BomNotEditableError";
  }
}
