"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchLedger,
  type LedgerEntryDto,
  type LedgerSummary,
} from "@/lib/api";
import { formatInr } from "@/lib/format";
import { useConsole } from "@/lib/console-context";
import { Button, PageHeader, StatusDot } from "@/components/ui";
import { IconMoney } from "@/components/shell/icons";
import { AuditExplorer } from "./AuditExplorer";
import { DemoControls } from "./DemoControls";

type SortKey = "when" | "dir" | "id" | "counterparty" | "amount" | "status";

const COLUMNS: { id: SortKey; label: string; numeric?: boolean }[] = [
  { id: "when", label: "When" },
  { id: "dir", label: "Dir" },
  { id: "id", label: "ID" },
  { id: "counterparty", label: "Counterparty" },
  { id: "amount", label: "Amount", numeric: true },
  { id: "status", label: "Status" },
];

function compareEntries(
  a: LedgerEntryDto,
  b: LedgerEntryDto,
  key: SortKey,
  dir: 1 | -1,
): number {
  let cmp = 0;
  switch (key) {
    case "when":
      cmp = new Date(a.at).getTime() - new Date(b.at).getTime();
      break;
    case "dir":
      cmp = a.direction.localeCompare(b.direction);
      break;
    case "id":
      cmp = a.node.label.localeCompare(b.node.label);
      break;
    case "counterparty":
      cmp = (a.counterparty ?? "").localeCompare(b.counterparty ?? "");
      break;
    case "amount":
      cmp = a.amountInPaise - b.amountInPaise;
      break;
    case "status":
      cmp = a.status.localeCompare(b.status);
      break;
  }
  return cmp * dir;
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "teal" | "warn" | "muted";
}) {
  const valueClass =
    tone === "teal"
      ? "text-teal"
      : tone === "warn"
        ? "text-warn"
        : "text-text";
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-muted">
        <IconMoney className="h-3.5 w-3.5" />
        <span className="text-xs font-medium uppercase tracking-[0.06em]">
          {label}
        </span>
      </div>
      <p
        className={`mt-2 font-mono text-lg tabular-nums ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export function LedgerView() {
  const { setView, reload } = useConsole();
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLedger(await fetchLedger());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ledger");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overduePaise = useMemo(() => {
    if (!ledger) return 0;
    return ledger.entries
      .filter(
        (e) =>
          e.direction === "in" &&
          (e.status === "expired" || e.status === "failed"),
      )
      .reduce((sum, e) => sum + e.amountInPaise, 0);
  }, [ledger]);

  const sorted = useMemo(() => {
    if (!ledger) return [];
    return [...ledger.entries].sort((a, b) =>
      compareEntries(a, b, sortKey, sortDir),
    );
  }, [ledger, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "when" || key === "amount" ? -1 : 1);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto" aria-label="Money ledger">
      <PageHeader
        title="Money"
        subtitle="Payments in and payouts out from the graph."
        trailing={
          <Button variant="ghost" size="sm" onClick={() => setView("policies")}>
            Policies →
          </Button>
        }
      />

      {error ? (
        <p className="px-5 py-3 text-sm text-muted">{error}</p>
      ) : null}

      {ledger ? (
        <>
          <div className="grid grid-cols-2 gap-3 px-5 py-4 lg:grid-cols-4">
            <KpiCard
              label="Collected"
              value={formatInr(ledger.cashInPaise)}
              tone="teal"
            />
            <KpiCard
              label="Outstanding"
              value={formatInr(ledger.receivablesInPaise)}
            />
            <KpiCard
              label="Overdue"
              value={formatInr(overduePaise)}
              tone="warn"
            />
            <KpiCard
              label="Payouts out"
              value={formatInr(ledger.payoutsOutInPaise)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-line">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.id}
                      className={[
                        "px-5 py-2",
                        col.numeric ? "text-right" : "",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={[
                          "text-xs font-medium uppercase tracking-[0.06em] text-muted",
                          "transition-colors duration-100 hover:text-text",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                        ].join(" ")}
                      >
                        {col.label}
                        {sortKey === col.id ? (sortDir === 1 ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => (
                  <tr
                    key={entry.node._id}
                    className="border-b border-line/60 transition-colors duration-100 hover:bg-surface"
                  >
                    <td className="px-5 py-2 font-mono text-sm text-muted tabular-nums">
                      {new Date(entry.at).toLocaleString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td
                      className={[
                        "px-5 py-2 font-mono text-sm",
                        entry.direction === "in" ? "text-teal" : "text-copper",
                      ].join(" ")}
                    >
                      {entry.direction}
                    </td>
                    <td className="px-5 py-2 font-mono text-sm text-text">
                      {entry.node.label}
                    </td>
                    <td className="px-5 py-2 text-muted">
                      {entry.counterparty ?? "—"}
                    </td>
                    <td className="px-5 py-2 text-right font-mono tabular-nums text-text">
                      {formatInr(entry.amountInPaise)}
                    </td>
                    <td className="px-5 py-2">
                      <span className="inline-flex items-center gap-2 text-sm text-muted">
                        <StatusDot status={entry.status} size="sm" />
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !error ? (
        <p className="px-5 py-3 text-sm text-muted">Loading ledger…</p>
      ) : null}

      <AuditExplorer />
      <DemoControls
        onDone={async () => {
          await reload();
          await load();
        }}
      />
    </section>
  );
}
