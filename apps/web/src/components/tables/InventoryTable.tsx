"use client";

import { useMemo } from "react";
import { useConsole } from "@/lib/console-context";
import { NodeInspector } from "@/components/graph/NodeInspector";
import {
  Badge,
  DataTable,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";
import { buildInventoryRows, type InventoryRow } from "./inventory-columns";

function isLowStock(row: InventoryRow): boolean {
  if (row.reorderFlag) return true;
  if (row.available === null) return false;
  if (row.available <= 0) return true;
  return row.reserved !== null && row.available < row.reserved;
}

function stockStatus(row: InventoryRow): { status: string; label: string } {
  if (isLowStock(row)) return { status: "low", label: "Low" };
  if (row.available !== null) return { status: "ok", label: "In stock" };
  return { status: "draft", label: "—" };
}

type InventoryTableRow = InventoryRow & { status: string };

function toTableRow(row: InventoryRow): InventoryTableRow {
  return { ...row, status: stockStatus(row).status };
}

const columns: Column<InventoryTableRow>[] = [
  {
    key: "key",
    label: "Item",
    sortable: true,
    width: "200px",
    render: (row) => <span className="font-mono text-xs">{row.key}</span>,
  },
  {
    key: "label",
    label: "Label",
    sortable: true,
    render: (row) => row.label,
  },
  {
    key: "available",
    label: "Stock",
    sortable: true,
    width: "120px",
    align: "right",
    numeric: true,
    render: (row) => {
      if (row.available === null && !row.reorderFlag) return "—";
      const low = isLowStock(row);
      return (
        <span className="inline-flex items-center justify-end gap-2">
          {row.available !== null ? (
            <span
              className={[
                "font-mono tabular-nums",
                low ? "text-risk" : "",
              ].join(" ")}
            >
              {row.available}
            </span>
          ) : null}
          {low ? <Badge tone="risk">Low</Badge> : null}
        </span>
      );
    },
  },
  {
    key: "onHand",
    label: "On hand",
    sortable: true,
    width: "90px",
    align: "right",
    numeric: true,
    render: (row) =>
      row.onHand !== null ? (
        <span className="font-mono tabular-nums">{row.onHand}</span>
      ) : (
        "—"
      ),
  },
  {
    key: "reserved",
    label: "Reserved",
    sortable: true,
    width: "90px",
    align: "right",
    numeric: true,
    render: (row) =>
      row.reserved !== null ? (
        <span className="font-mono tabular-nums">{row.reserved}</span>
      ) : (
        "—"
      ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "120px",
    render: (row) => {
      const { status, label } = stockStatus(row);
      return (
        <span className="inline-flex items-center gap-2">
          <StatusDot status={status} size="sm" />
          {label}
        </span>
      );
    },
  },
  {
    key: "location",
    label: "Location",
    sortable: true,
    width: "140px",
    render: (row) => row.location ?? "—",
  },
];

export function InventoryTable() {
  const { graph, selectedNodeKey, selectNode } = useConsole();
  const rows = useMemo(
    () => (graph ? buildInventoryRows(graph).map(toTableRow) : []),
    [graph],
  );
  const countLabel = `${rows.length} ${rows.length === 1 ? "item" : "items"}`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader title="Inventory" subtitle={countLabel} />
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(row) => row.key}
        selectedKey={selectedNodeKey}
        onRowClick={(row) => selectNode(row.key)}
        emptyTitle="No inventory items"
        emptyDescription="Stock, SKUs, and materials will show up here once they exist on the graph."
      />
      <NodeInspector
        nodeKey={selectedNodeKey}
        onClose={() => selectNode(null)}
      />
    </div>
  );
}
