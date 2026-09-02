"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  fetchInbox,
  fetchAuditEvents,
  fetchLedger,
  fetchPendingApprovals,
  fetchAgentKpis,
  type ApiException,
  type AgentKpiDto,
  type ApprovalDto,
  type AuditEventDto,
  type Bootstrap,
  type InboxAction,
  type LedgerSummary,
  type MorningBriefing,
  api,
} from "@/lib/api";
import { useAgent } from "@/lib/agent-context";
import { formatCash, formatInr, orderStatusTone } from "@/lib/format";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  StatusDot,
  Tooltip,
  type BadgeTone,
  type Column,
} from "@/components/ui";

type OrderBookRow = {
  key: string;
  label: string;
  status: string;
  customerOrgKey: string | null;
  customerLabel: string | null;
  promiseDate: string | null;
  lines: Array<{ skuKey: string; skuLabel: string; qty: number }>;
  invoiceKey: string | null;
  amountInPaise: number | null;
};

type DashboardData = {
  bootstrap: Bootstrap;
  ledger: LedgerSummary;
  orders: OrderBookRow[];
  exceptions: ApiException[];
  briefing: MorningBriefing | null;
  approvals: ApprovalDto[];
  audit: AuditEventDto[];
  agentKpis: AgentKpiDto[];
};

const CLOSED_ORDER_STATUSES = new Set([
  "cancelled",
  "paid",
  "delivered",
  "shipped",
  "received",
]);

function relativeTime(iso: string, now = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const suffix = diffMs >= 0 ? "ago" : "from now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ${suffix}`;
  return new Date(iso).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function revenueThisMonth(ledger: LedgerSummary): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return ledger.entries.reduce((sum, entry) => {
    if (entry.direction !== "in") return sum;
    const at = new Date(entry.at);
    if (at.getFullYear() !== year || at.getMonth() !== month) return sum;
    return sum + entry.amountInPaise;
  }, 0);
}

function pendingOrderCount(orders: OrderBookRow[]): number {
  return orders.filter((o) => !CLOSED_ORDER_STATUSES.has(o.status.toLowerCase()))
    .length;
}

function auditDescription(ev: AuditEventDto): string {
  if (ev.label) return ev.label;
  return String(ev.props.event_type ?? ev.key);
}

function eventTone(eventType: string): BadgeTone {
  if (eventType.includes("fail") || eventType.includes("expir")) return "risk";
  if (eventType.includes("approval") || eventType.includes("pending")) {
    return "warn";
  }
  if (
    eventType.includes("paid") ||
    eventType.includes("captured") ||
    eventType.includes("created")
  ) {
    return "success";
  }
  return "accent";
}

function priorityTone(priority: ApiException["priority"]): BadgeTone {
  if (priority === "critical") return "risk";
  if (priority === "high") return "warn";
  if (priority === "medium") return "warn";
  return "success";
}

function statusToneClass(status: string): string {
  const tone = orderStatusTone(status);
  if (tone === "teal") return "text-teal";
  if (tone === "warn") return "text-warn";
  if (tone === "risk") return "text-risk";
  return "text-muted";
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-md)] bg-surface-2 ${className}`}
    />
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-md font-medium text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  label,
  value,
  trend,
  why,
  onClick,
}: {
  label: string;
  value: string;
  trend?: { dir: "up" | "down" | "stable"; label: string };
  why?: string;
  onClick?: () => void;
}) {
  const card = (
    <button
      type="button"
      onClick={onClick}
      className={[
        "bg-surface border border-line rounded-[var(--radius-md)] p-4 text-left w-full",
        "transition-colors duration-[var(--duration-fast)]",
        onClick
          ? "cursor-pointer hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          : "cursor-default",
      ].join(" ")}
    >
      <p className="text-sm uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-mono text-xl font-medium tabular-nums text-text">
        {value}
      </p>
      {trend ? (
        <p
          className={[
            "mt-1 text-xs tabular-nums",
            trend.dir === "up"
              ? "text-teal"
              : trend.dir === "down"
                ? "text-risk"
                : "text-muted",
          ].join(" ")}
        >
          {trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "→"}
          {trend.label ? ` ${trend.label}` : null}
        </p>
      ) : null}
    </button>
  );

  if (why) {
    return (
      <Tooltip label={why} position="bottom">
        {card}
      </Tooltip>
    );
  }
  return card;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 px-5 py-5">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-4">
        <SkeletonBlock className="col-span-3 h-72" />
        <SkeletonBlock className="col-span-2 h-72" />
      </div>
      <div className="grid grid-cols-5 gap-4">
        <SkeletonBlock className="col-span-3 h-56" />
        <SkeletonBlock className="col-span-2 h-56" />
      </div>
    </div>
  );
}

const orderColumns: Column<OrderBookRow>[] = [
  {
    key: "label",
    label: "Order",
    render: (row) => (
      <span className="font-mono text-sm text-text">{row.label}</span>
    ),
  },
  {
    key: "customerLabel",
    label: "Customer",
    render: (row) => (
      <span className="text-text">{row.customerLabel ?? "—"}</span>
    ),
  },
  {
    key: "amountInPaise",
    label: "Amount",
    align: "right",
    numeric: true,
    render: (row) => (
      <span className="font-mono tabular-nums text-text">
        {row.amountInPaise != null ? formatCash(row.amountInPaise) : "—"}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <StatusDot status={row.status} size="sm" />
        <span className={`capitalize ${statusToneClass(row.status)}`}>
          {row.status}
        </span>
      </span>
    ),
  },
];

export function DashboardPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const { sendMessage, requestOpenDock } = useAgent();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [bootstrap, ledger, ordersRes, inbox, approvals, audit, kpisRes] =
          await Promise.all([
            api<Bootstrap>("/v1/bootstrap"),
            fetchLedger(),
            api<{ orders: OrderBookRow[] }>("/v1/sales/orders"),
            fetchInbox(),
            fetchPendingApprovals(),
            fetchAuditEvents(8),
            fetchAgentKpis(),
          ]);
        if (cancelled) return;
        setData({
          bootstrap,
          ledger,
          orders: ordersRes.orders,
          exceptions: inbox.exceptions,
          briefing: inbox.briefing,
          approvals,
          audit,
          agentKpis: kpisRes.kpis,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const onAlertAction = (action: InboxAction) => {
    if (action.kind === "agent_prompt" && action.payload.message) {
      requestOpenDock();
      void sendMessage(action.payload.message);
      return;
    }
    if (action.kind === "navigate" && action.payload.nodeKey) {
      onNavigate(action.payload.nodeKey);
    }
  };

  const onGenerateReport = () => {
    requestOpenDock();
    void sendMessage("Prepare my weekly management report");
  };

  const subtitle = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const recentOrders = data?.orders.slice(0, 8) ?? [];
  const alerts =
    data?.briefing?.topItems?.slice(0, 3) ??
    data?.exceptions.slice(0, 3) ??
    [];
  const pendingApprovals = data?.approvals.slice(0, 4) ?? [];
  const activity = data?.audit.slice(0, 8) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Dashboard"
        subtitle={subtitle}
        trailing={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onGenerateReport}
            >
              Generate Report
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate("new-invoice")}
            >
              New Invoice
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate("new-po")}
            >
              New PO
            </Button>
          </>
        }
      />

      {loading ? <DashboardSkeleton /> : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load dashboard"
            description={error}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            }
          />
        </div>
      ) : null}

      {!loading && !error && data ? (
        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.agentKpis.length > 0
              ? data.agentKpis.map((kpi) => {
                  const trendDir =
                    kpi.trend === "up" ||
                    kpi.trend === "down" ||
                    kpi.trend === "stable"
                      ? kpi.trend
                      : undefined;
                  return (
                    <KpiCard
                      key={kpi.label}
                      label={kpi.label}
                      value={kpi.value}
                      {...(kpi.why ? { why: kpi.why } : {})}
                      {...(trendDir
                        ? { trend: { dir: trendDir, label: "" } }
                        : {})}
                      onClick={() => {
                        if (kpi.nodeKey) onNavigate(kpi.nodeKey);
                        else onNavigate("ledger");
                      }}
                    />
                  );
                })
              : (
                <>
                  <KpiCard
                    label="Revenue This Month"
                    value={formatCash(revenueThisMonth(data.ledger))}
                    trend={{ dir: "up", label: "12%" }}
                    onClick={() => onNavigate("ledger")}
                  />
                  <KpiCard
                    label="Outstanding Receivables"
                    value={formatCash(data.ledger.receivablesInPaise)}
                    onClick={() => onNavigate("ledger")}
                  />
                  <KpiCard
                    label="Cash Balance"
                    value={formatCash(data.bootstrap.cashInPaise)}
                    onClick={() => onNavigate("ledger")}
                  />
                  <KpiCard
                    label="Pending Orders"
                    value={String(pendingOrderCount(data.orders))}
                    onClick={() => onNavigate("sales-orders")}
                  />
                </>
              )}
          </div>

          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3">
              <SectionCard
                title="Recent Orders"
                action={
                  <button
                    type="button"
                    onClick={() => onNavigate("sales-orders")}
                    className="text-sm text-signal hover:underline"
                  >
                    View all orders →
                  </button>
                }
              >
                <DataTable
                  columns={orderColumns}
                  data={recentOrders}
                  keyExtractor={(row) => row.key}
                  onRowClick={() => onNavigate("sales-orders")}
                  emptyTitle="No sales orders"
                  emptyDescription="Accepted orders will show up here."
                />
              </SectionCard>
            </div>

            <div className="col-span-2">
              <SectionCard
                title="Alerts & Exceptions"
                action={
                  <button
                    type="button"
                    onClick={() => onNavigate("inbox")}
                    className="text-sm text-signal hover:underline"
                  >
                    View all →
                  </button>
                }
              >
                {alerts.length === 0 ? (
                  <EmptyState title="All clear" description="No open exceptions." />
                ) : (
                  <ul className="divide-y divide-line">
                    {alerts.map((ex) => {
                      const primary = ex.actions?.[0];
                      return (
                        <li key={ex.id} className="py-3">
                          <div className="flex items-start gap-3">
                            <Badge tone={priorityTone(ex.priority)}>
                              {ex.priority ?? ex.severity}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <p className="text-base text-text">{ex.title}</p>
                              {ex.why ? (
                                <p className="mt-0.5 text-sm text-muted">{ex.why}</p>
                              ) : null}
                              {ex.recommendation ? (
                                <p className="mt-1 text-sm text-muted">
                                  <span className="font-medium text-text/80">
                                    Recommendation:{" "}
                                  </span>
                                  {ex.recommendation}
                                </p>
                              ) : null}
                              {primary ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="mt-2"
                                  onClick={() => onAlertAction(primary)}
                                >
                                  {primary.label}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {alerts.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onNavigate("inbox")}
                    className="mt-3 text-sm text-signal hover:underline"
                  >
                    View all →
                  </button>
                ) : null}
              </SectionCard>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3">
              <SectionCard
                title="Pending Approvals"
                action={
                  <button
                    type="button"
                    onClick={() => onNavigate("approvals")}
                    className="text-sm text-signal hover:underline"
                  >
                    View all →
                  </button>
                }
              >
                {pendingApprovals.length === 0 ? (
                  <EmptyState
                    title="No pending approvals"
                    description="Policy-gated actions will land here."
                  />
                ) : (
                  <ul className="space-y-3">
                    {pendingApprovals.map((approval) => {
                      const amount = approval.proposedAction.amountInPaise;
                      return (
                        <li key={approval._id}>
                          <button
                            type="button"
                            onClick={() => onNavigate("approvals")}
                            className="w-full border-l-[3px] border-l-copper bg-surface-2/40 px-3 py-3 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-base font-medium text-text">
                                  {approval.proposedAction.action}
                                </p>
                                <p className="mt-1 text-sm text-muted">
                                  Requested by{" "}
                                  <span className="font-mono">
                                    {approval.proposedAction.proposedBy}
                                  </span>
                                </p>
                              </div>
                              {amount != null ? (
                                <p className="shrink-0 font-mono text-base tabular-nums text-teal">
                                  {formatInr(amount)}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>
            </div>

            <div className="col-span-2">
              <SectionCard title="Recent Activity">
                {activity.length === 0 ? (
                  <EmptyState
                    title="No recent activity"
                    description="Audit events will appear here."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {activity.map((ev) => {
                      const eventType = String(ev.props.event_type ?? "event");
                      const at = String(ev.props.at ?? "");
                      return (
                        <li
                          key={ev._id}
                          className="flex items-start gap-3 py-3"
                        >
                          <Badge tone={eventTone(eventType)}>
                            {eventType.split(".").pop() ?? eventType}
                          </Badge>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base text-text">
                              {auditDescription(ev)}
                            </span>
                            {at ? (
                              <span className="mt-0.5 block text-xs text-muted">
                                {relativeTime(at)}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
