"use client";

import { useMemo } from "react";
import { useConsole } from "@/lib/console-context";
import { NodeInspector } from "@/components/graph/NodeInspector";
import { DataTable, PageHeader, StatusDot, type Column } from "@/components/ui";
import { buildOrderRows, type OrderRow } from "./orders-columns";

const columns: Column<OrderRow>[] = [
  {
    key: "key",
    label: "ID",
    sortable: true,
    width: "180px",
    render: (row) => (
      <span className="font-mono text-xs">{row.key.split(":")[1] ?? row.key}</span>
    ),
  },
  {
    key: "orderType",
    label: "Type",
    sortable: true,
    width: "100px",
    render: (row) => (row.orderType === "SalesOrder" ? "Sales" : "Purchase"),
  },
  {
    key: "counterparty",
    label: "Counterparty",
    sortable: true,
    render: (row) => row.counterparty ?? "—",
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "120px",
    render: (row) =>
      row.status ? (
        <span className="inline-flex items-center gap-2">
          <StatusDot status={row.status} size="sm" />
          {row.status}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "dateLabel",
    label: "Promise/Due",
    sortable: true,
    width: "120px",
    render: (row) => row.dateLabel ?? "—",
  },
  {
    key: "amountPaise",
    label: "Amount",
    sortable: true,
    width: "100px",
    align: "right",
    numeric: true,
    render: (row) => (
      <span className="font-mono tabular-nums">{row.amountLabel ?? "—"}</span>
    ),
  },
];

export function OrdersTable() {
  const { graph, selectedNodeKey, selectNode } = useConsole();
  const rows = useMemo(
    () => (graph ? buildOrderRows(graph) : []),
    [graph],
  );
  const countLabel = `${rows.length} ${rows.length === 1 ? "order" : "orders"}`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader title="Orders" subtitle={countLabel} />
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(row) => row.key}
        selectedKey={selectedNodeKey}
        onRowClick={(row) => selectNode(row.key)}
        emptyTitle="No orders yet"
        emptyDescription="Orders appear here once sales or purchase orders exist on the graph."
      />
      <NodeInspector
        nodeKey={selectedNodeKey}
        onClose={() => selectNode(null)}
      />
    </div>
  );
}
