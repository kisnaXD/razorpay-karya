"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  Badge,
  Button,
  DataTable,
  FilterChip,
  PageHeader,
  StatusDot,
  type BadgeTone,
  type Column,
} from "@/components/ui";
import {
  fetchRoles,
  fetchUsers,
  updateUserStatus,
  type RoleDto,
  type UserDto,
} from "@/lib/api";

type UserStatus = UserDto["status"];

const ROLE_TONES: Record<string, BadgeTone> = {
  admin: "risk",
  accountant: "warn",
  storekeeper: "accent",
  shop_supervisor: "success",
  sales: "muted",
  viewer: "muted",
};

const MODULES = [
  "dashboard",
  "sales",
  "purchases",
  "inventory",
  "manufacturing",
  "finance",
  "reports",
  "settings",
] as const;

const PERMISSIONS = ["read", "write", "approve"] as const;

const STATUS_FILTERS = ["All", "Active", "Invited", "Disabled"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function statusDotKey(status: UserStatus): string {
  if (status === "active") return "paid";
  if (status === "invited") return "pending";
  return "failed";
}

function statusLabel(status: UserStatus): string {
  if (status === "active") return "Active";
  if (status === "invited") return "Invited";
  return "Disabled";
}

function statusBadgeTone(status: UserStatus): BadgeTone {
  if (status === "active") return "success";
  if (status === "invited") return "warn";
  return "risk";
}

function roleTone(roleId: string): BadgeTone {
  return ROLE_TONES[roleId] ?? "muted";
}

function roleShortLabel(role: RoleDto): string {
  if (role.id === "admin") return "Admin";
  if (role.id === "shop_supervisor") return "Shop Supervisor";
  return role.name;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "Never";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function moduleLabel(module: string): string {
  return module.charAt(0).toUpperCase() + module.slice(1);
}

function primaryRoleId(user: UserDto): string {
  return user.roleIds[0] ?? "viewer";
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "risk" | "teal" | "warn" | "muted";
}) {
  const valueClass =
    tone === "risk"
      ? "text-risk"
      : tone === "teal"
        ? "text-teal"
        : tone === "warn"
          ? "text-warn"
          : "text-text";
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
      <p className="text-sm uppercase tracking-wider text-muted">{label}</p>
      <p
        className={[
          "mt-2 font-mono text-xl font-medium tabular-nums",
          valueClass,
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function Avatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "h-12 w-12 text-sm" : "h-8 w-8 text-[12px]";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full",
        "bg-signal/10 font-medium text-signal",
        sizeClass,
      ].join(" ")}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function PermissionGrid({
  role,
}: {
  role: RoleDto | undefined;
}) {
  const access = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const perm of role?.permissions ?? []) {
      map.set(perm.module, new Set(perm.actions));
    }
    return map;
  }, [role]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
      <table className="w-full border-collapse text-[11px] font-mono">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-muted">
            <th className="px-3 py-2 text-left font-medium">Module</th>
            {PERMISSIONS.map((p) => (
              <th
                key={p}
                className="px-2 py-2 text-center font-medium capitalize"
              >
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((mod) => (
            <tr key={mod} className="border-b border-line last:border-b-0">
              <td className="px-3 py-1.5 text-text">{moduleLabel(mod)}</td>
              {PERMISSIONS.map((perm) => {
                const allowed = Boolean(access.get(mod)?.has(perm));
                return (
                  <td
                    key={perm}
                    className={[
                      "px-2 py-1.5 text-center",
                      allowed ? "text-teal" : "text-muted",
                    ].join(" ")}
                  >
                    {allowed ? "✓" : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsersPage({
  onNavigate: _onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("All");
  const [roleFilter, setRoleFilter] = useState<string>("All Roles");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextUsers, nextRoles] = await Promise.all([
        fetchUsers(),
        fetchRoles(),
      ]);
      setUsers(nextUsers);
      setRoles(nextRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleById = useMemo(() => {
    return Object.fromEntries(roles.map((r) => [r.id, r])) as Record<
      string,
      RoleDto
    >;
  }, [roles]);

  const roleFilters = useMemo(() => {
    return ["All Roles", ...roles.map((r) => roleShortLabel(r))];
  }, [roles]);

  const summary = useMemo(() => {
    return {
      active: users.filter((u) => u.status === "active").length,
      invited: users.filter((u) => u.status === "invited").length,
      disabled: users.filter((u) => u.status === "disabled").length,
    };
  }, [users]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const role of roles) counts[role.id] = 0;
    for (const user of users) {
      for (const roleId of user.roleIds) {
        counts[roleId] = (counts[roleId] ?? 0) + 1;
      }
    }
    return counts;
  }, [users, roles]);

  const filtered = useMemo(() => {
    return users.filter((user) => {
      if (statusFilter !== "All" && statusLabel(user.status) !== statusFilter) {
        return false;
      }
      if (roleFilter !== "All Roles") {
        const match = user.roleIds.some((id) => {
          const role = roleById[id];
          return role ? roleShortLabel(role) === roleFilter : false;
        });
        if (!match) return false;
      }
      return true;
    });
  }, [users, statusFilter, roleFilter, roleById]);

  const selected = users.find((u) => u._id === selectedId) ?? null;
  const selectedPrimaryRole = selected
    ? roleById[primaryRoleId(selected)]
    : undefined;

  async function toggleStatus(userId: string, event?: MouseEvent) {
    event?.stopPropagation();
    const user = users.find((u) => u._id === userId);
    if (!user || togglingId) return;
    const nextStatus: UserStatus =
      user.status === "disabled" ? "active" : "disabled";
    setTogglingId(userId);
    try {
      await updateUserStatus(userId, nextStatus);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update user status",
      );
    } finally {
      setTogglingId(null);
    }
  }

  const columns: Column<UserDto>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-2.5">
          <Avatar name={row.name} />
          <span className="text-sm text-text">{row.name}</span>
        </span>
      ),
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (row) => (
        <span className="text-sm text-muted">{row.email}</span>
      ),
    },
    {
      key: "roleIds",
      label: "Role",
      sortable: true,
      render: (row) => {
        const roleId = primaryRoleId(row);
        const role = roleById[roleId];
        return (
          <Badge tone={roleTone(roleId)}>
            {role ? roleShortLabel(role) : roleId}
          </Badge>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      width: "120px",
      render: (row) => (
        <span className="inline-flex items-center gap-2 text-sm capitalize">
          <StatusDot status={statusDotKey(row.status)} size="sm" />
          {statusLabel(row.status)}
        </span>
      ),
    },
    {
      key: "lastActiveAt",
      label: "Last Active",
      sortable: true,
      width: "110px",
      render: (row) => (
        <span className="font-mono text-sm tabular-nums text-muted">
          {formatRelativeTime(row.lastActiveAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: "160px",
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(row._id);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={togglingId === row._id}
            onClick={(e) => void toggleStatus(row._id, e)}
          >
            {row.status === "disabled" ? "Enable" : "Disable"}
          </Button>
        </span>
      ),
    },
  ];

  const subtitle = loading
    ? "Loading…"
    : `${users.length} ${users.length === 1 ? "user" : "users"}`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Users & Roles"
        subtitle={subtitle}
        trailing={
          <Button variant="primary" size="sm">
            Invite User
          </Button>
        }
      />

      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Loading users…</p>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <p className="text-sm text-risk">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="grid grid-cols-3 gap-3 px-5 py-5">
            <SummaryCard
              label="Active"
              value={String(summary.active)}
              tone="teal"
            />
            <SummaryCard
              label="Invited"
              value={String(summary.invited)}
              tone="warn"
            />
            <SummaryCard
              label="Disabled"
              value={String(summary.disabled)}
              tone={summary.disabled > 0 ? "risk" : "muted"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            {STATUS_FILTERS.map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </FilterChip>
            ))}
            <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
            {roleFilters.map((role) => (
              <FilterChip
                key={role}
                active={roleFilter === role}
                onClick={() => setRoleFilter(role)}
              >
                {role}
              </FilterChip>
            ))}
          </div>

          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(row) => row._id}
            selectedKey={selectedId}
            onRowClick={(row) => setSelectedId(row._id)}
            emptyTitle="No users match"
            emptyDescription="Try a different status or role filter."
          />

          <section className="border-t border-line px-5 py-6">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-text">Roles</h2>
              <p className="mt-0.5 text-sm text-muted">
                Built-in roles for Arka Atelier. Assign one role per user.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="rounded-[var(--radius-md)] border border-line bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text">
                      {roleShortLabel(role)}
                    </p>
                    <Badge tone={roleTone(role.id)}>
                      {roleCounts[role.id] ?? 0}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{role.description}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {selected ? (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-[420px] flex-col border-l border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium text-text">User detail</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
            >
              ✕
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-auto px-4 py-4">
            <section>
              <div className="flex items-start gap-3">
                <Avatar name={selected.name} size="lg" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {selected.name}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {selected.email}
                  </p>
                  {selected.phone ? (
                    <p className="mt-0.5 text-sm text-muted">{selected.phone}</p>
                  ) : null}
                  <div className="mt-2">
                    <Badge tone={statusBadgeTone(selected.status)}>
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot
                          status={statusDotKey(selected.status)}
                          size="sm"
                        />
                        {statusLabel(selected.status)}
                      </span>
                    </Badge>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Roles
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selected.roleIds.map((roleId) => {
                  const role = roleById[roleId];
                  return (
                    <Badge key={roleId} tone={roleTone(roleId)}>
                      {role ? roleShortLabel(role) : roleId}
                    </Badge>
                  );
                })}
              </div>
              {selectedPrimaryRole ? (
                <p className="mt-2 text-sm text-muted">
                  {selectedPrimaryRole.description}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Permissions preview
              </h3>
              <PermissionGrid role={selectedPrimaryRole} />
            </section>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Activity
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Last login</dt>
                  <dd className="font-mono tabular-nums text-text">
                    {formatRelativeTime(selected.lastLoginAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Last active</dt>
                  <dd className="font-mono tabular-nums text-text">
                    {formatRelativeTime(selected.lastActiveAt)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedId(selected._id)}
            >
              Edit Role
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={togglingId === selected._id}
              onClick={() => void toggleStatus(selected._id)}
            >
              {selected.status === "disabled" ? "Enable" : "Disable"}
            </Button>
            {selected.status === "invited" ? (
              <Button variant="primary" size="sm">
                Resend Invite
              </Button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
