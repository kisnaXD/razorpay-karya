import type { Db } from "mongodb";
import { ulid } from "ulid";

export type UserStatus = "active" | "invited" | "disabled";
export type RoleId =
  | "admin"
  | "accountant"
  | "storekeeper"
  | "shop_supervisor"
  | "sales"
  | "viewer";

export type UserRecord = {
  _id: string;
  orgId: string;
  email: string;
  name: string;
  phone: string | null;
  roleIds: RoleId[];
  status: UserStatus;
  lastActiveAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RoleDefinition = {
  id: RoleId;
  name: string;
  description: string;
  permissions: { module: string; actions: string[] }[];
};

export const ROLES: RoleDefinition[] = [
  {
    id: "admin",
    name: "Administrator",
    description: "Full access to everything",
    permissions: [
      { module: "dashboard", actions: ["read", "write", "approve"] },
      { module: "sales", actions: ["read", "write", "approve"] },
      { module: "purchases", actions: ["read", "write", "approve"] },
      { module: "inventory", actions: ["read", "write", "approve"] },
      { module: "manufacturing", actions: ["read", "write", "approve"] },
      { module: "finance", actions: ["read", "write", "approve"] },
      { module: "reports", actions: ["read", "write", "approve"] },
      { module: "settings", actions: ["read", "write", "approve"] },
    ],
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Finance, payments, GST, limited approvals",
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "sales", actions: ["read"] },
      { module: "purchases", actions: ["read"] },
      { module: "inventory", actions: ["read"] },
      { module: "finance", actions: ["read", "write", "approve"] },
      { module: "reports", actions: ["read"] },
    ],
  },
  {
    id: "storekeeper",
    name: "Storekeeper",
    description: "Inventory, stock movements, purchase receipts",
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "purchases", actions: ["read", "write"] },
      { module: "inventory", actions: ["read", "write"] },
      { module: "reports", actions: ["read"] },
    ],
  },
  {
    id: "shop_supervisor",
    name: "Shop Supervisor",
    description: "Production, BOMs, work orders, job cards",
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "inventory", actions: ["read"] },
      { module: "manufacturing", actions: ["read", "write", "approve"] },
      { module: "reports", actions: ["read"] },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    description: "Customers, orders, invoices, dispatch",
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "sales", actions: ["read", "write"] },
      { module: "inventory", actions: ["read"] },
      { module: "reports", actions: ["read"] },
    ],
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access across all modules",
    permissions: [
      { module: "dashboard", actions: ["read"] },
      { module: "sales", actions: ["read"] },
      { module: "purchases", actions: ["read"] },
      { module: "inventory", actions: ["read"] },
      { module: "manufacturing", actions: ["read"] },
      { module: "finance", actions: ["read"] },
      { module: "reports", actions: ["read"] },
      { module: "settings", actions: ["read"] },
    ],
  },
];

const ROLE_IDS = new Set<RoleId>(ROLES.map((r) => r.id));

function collection(db: Db) {
  return db.collection<UserRecord>("users");
}

function newUserId(): string {
  return `usr_${ulid()}`;
}

export function isRoleId(value: string): value is RoleId {
  return ROLE_IDS.has(value as RoleId);
}

export function isUserStatus(value: string): value is UserStatus {
  return value === "active" || value === "invited" || value === "disabled";
}

export async function ensureUserIndexes(db: Db): Promise<void> {
  await collection(db).createIndex({ orgId: 1, email: 1 }, { unique: true });
}

export async function listUsers(
  db: Db,
  orgId: string,
  filter?: { status?: UserStatus; role?: RoleId },
): Promise<UserRecord[]> {
  const query: {
    orgId: string;
    status?: UserStatus;
    roleIds?: RoleId;
  } = { orgId };
  if (filter?.status) query.status = filter.status;
  if (filter?.role) query.roleIds = filter.role;
  return collection(db).find(query).sort({ name: 1 }).toArray();
}

export async function getUser(
  db: Db,
  orgId: string,
  userId: string,
): Promise<UserRecord | null> {
  return collection(db).findOne({ _id: userId, orgId });
}

export type CreateUserInput = {
  email: string;
  name: string;
  phone?: string | null;
  roleIds: RoleId[];
  status?: UserStatus;
};

export async function createUser(
  db: Db,
  orgId: string,
  input: CreateUserInput,
): Promise<UserRecord> {
  const now = new Date();
  const record: UserRecord = {
    _id: newUserId(),
    orgId,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    phone: input.phone ?? null,
    roleIds: input.roleIds,
    status: input.status ?? "invited",
    lastActiveAt: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await collection(db).insertOne(record);
  return record;
}

export type UpdateUserInput = {
  name?: string;
  phone?: string | null;
  roleIds?: RoleId[];
  status?: UserStatus;
};

export async function updateUser(
  db: Db,
  orgId: string,
  userId: string,
  updates: UpdateUserInput,
): Promise<UserRecord> {
  const existing = await getUser(db, orgId, userId);
  if (!existing) {
    throw new UserNotFoundError(userId);
  }

  const updated: UserRecord = {
    ...existing,
    ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
    ...(updates.roleIds !== undefined ? { roleIds: updates.roleIds } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    updatedAt: new Date(),
  };

  await collection(db).replaceOne({ _id: userId, orgId }, updated);
  return updated;
}

export function getRoles(): RoleDefinition[] {
  return ROLES;
}

export function getRolePermissions(
  roleIds: RoleId[],
): { module: string; actions: string[] }[] {
  const byModule = new Map<string, Set<string>>();
  for (const roleId of roleIds) {
    const role = ROLES.find((r) => r.id === roleId);
    if (!role) continue;
    for (const perm of role.permissions) {
      let actions = byModule.get(perm.module);
      if (!actions) {
        actions = new Set();
        byModule.set(perm.module, actions);
      }
      for (const action of perm.actions) {
        actions.add(action);
      }
    }
  }
  return [...byModule.entries()].map(([module, actions]) => ({
    module,
    actions: [...actions],
  }));
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = "UserNotFoundError";
  }
}
