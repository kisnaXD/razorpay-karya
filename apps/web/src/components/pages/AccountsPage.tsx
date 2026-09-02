"use client";

import { useEffect, useState } from "react";
import {
  api,
  fetchLedger,
  type Bootstrap,
  type LedgerSummary,
} from "@/lib/api";
import { loadGraphSnapshot } from "@/lib/graph-data";
import { formatCash } from "@/lib/format";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  type BadgeTone,
} from "@/components/ui";

type AccountType = "asset" | "liability" | "income" | "expense";

type AccountRow = {
  id: string;
  name: string;
  balancePaise: number | null;
  type: AccountType;
  note?: string;
};

type AccountGroup = {
  id: string;
  label: string;
  type: AccountType;
  accounts: AccountRow[];
};

type AccountsData = {
  bootstrap: Bootstrap;
  ledger: LedgerSummary;
  inventoryValuePaise: number;
};

const TYPE_TONE: Record<AccountType, BadgeTone> = {
  asset: "success",
  liability: "warn",
  income: "accent",
  expense: "muted",
};

function monthInbound(ledger: LedgerSummary): number {
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

function buildGroups(data: AccountsData): AccountGroup[] {
  const salesThisMonth = monthInbound(data.ledger);
  return [
    {
      id: "assets",
      label: "Assets",
      type: "asset",
      accounts: [
        {
          id: "cash",
          name: "Cash",
          balancePaise: data.bootstrap.cashInPaise,
          type: "asset",
          note: "From org cash balance",
        },
        {
          id: "bank",
          name: "Bank",
          balancePaise: data.ledger.cashInPaise,
          type: "asset",
          note: "Collected payments (ledger)",
        },
        {
          id: "inventory",
          name: "Inventory",
          balancePaise: data.inventoryValuePaise,
          type: "asset",
          note: "On-hand × SKU price",
        },
        {
          id: "receivables",
          name: "Receivables",
          balancePaise: data.ledger.receivablesInPaise,
          type: "asset",
        },
      ],
    },
    {
      id: "liabilities",
      label: "Liabilities",
      type: "liability",
      accounts: [
        {
          id: "payables",
          name: "Payables",
          balancePaise: data.ledger.payablesInPaise,
          type: "liability",
        },
        {
          id: "loans",
          name: "Loans",
          balancePaise: null,
          type: "liability",
          note: "Not tracked on graph yet",
        },
      ],
    },
    {
      id: "income",
      label: "Income",
      type: "income",
      accounts: [
        {
          id: "sales-revenue",
          name: "Sales Revenue",
          balancePaise: salesThisMonth,
          type: "income",
          note: "Inbound ledger this month",
        },
        {
          id: "other-income",
          name: "Other Income",
          balancePaise: null,
          type: "income",
          note: "Not tracked on graph yet",
        },
      ],
    },
    {
      id: "expenses",
      label: "Expenses",
      type: "expense",
      accounts: [
        {
          id: "materials",
          name: "Materials",
          balancePaise: data.ledger.payoutsOutInPaise,
          type: "expense",
          note: "Payouts out (proxy)",
        },
        {
          id: "labour",
          name: "Labour",
          balancePaise: null,
          type: "expense",
          note: "Not tracked on graph yet",
        },
        {
          id: "overhead",
          name: "Overhead",
          balancePaise: null,
          type: "expense",
          note: "Not tracked on graph yet",
        },
      ],
    },
  ];
}

function groupTotal(accounts: AccountRow[]): number {
  return accounts.reduce((sum, a) => sum + (a.balancePaise ?? 0), 0);
}

export function AccountsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [data, setData] = useState<AccountsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [bootstrap, ledger, snapshot] = await Promise.all([
          api<Bootstrap>("/v1/bootstrap"),
          fetchLedger(),
          loadGraphSnapshot(),
        ]);

        let inventoryValuePaise = 0;
        for (const node of snapshot.nodes.filter((n) => n.type === "Stock")) {
          const onHand =
            typeof node.props.on_hand === "number" ? node.props.on_hand : 0;
          const stockOf = snapshot.edges.find(
            (e) => e.type === "STOCK_OF" && e.fromId === node._id,
          );
          const sku = stockOf
            ? snapshot.nodeById.get(stockOf.toId)
            : undefined;
          const price =
            sku && typeof sku.props.priceInPaise === "number"
              ? sku.props.priceInPaise
              : 0;
          inventoryValuePaise += onHand * price;
        }

        if (cancelled) return;
        setData({ bootstrap, ledger, inventoryValuePaise });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = data ? buildGroups(data) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Chart of Accounts"
        subtitle="Simplified accounts derived from ledger and org cash."
        trailing={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("ledger")}
          >
            Ledger →
          </Button>
        }
      />

      {loading ? (
        <p className="px-5 py-6 text-sm text-muted">Loading accounts…</p>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load accounts"
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
        <div className="space-y-4 px-5 py-5">
          {groups.map((group) => (
            <section
              key={group.id}
              className="bg-surface border border-line rounded-[var(--radius-md)] overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-md font-medium text-text">{group.label}</h2>
                  <Badge tone={TYPE_TONE[group.type]}>{group.type}</Badge>
                </div>
                <p className="font-mono text-sm tabular-nums text-muted">
                  {formatCash(groupTotal(group.accounts))}
                </p>
              </div>
              <ul className="divide-y divide-line">
                {group.accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base text-text">{account.name}</span>
                        <Badge tone={TYPE_TONE[account.type]}>
                          {account.type}
                        </Badge>
                      </div>
                      {account.note ? (
                        <p className="mt-0.5 text-xs text-muted">{account.note}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-mono text-base tabular-nums text-text">
                      {account.balancePaise != null
                        ? formatCash(account.balancePaise)
                        : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
