"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export type Column<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right";
  numeric?: boolean;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  striped?: boolean;
  selectedKey?: string | null;
};

type SortState = { key: string; dir: "asc" | "desc" };

function readField<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  const mul = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * mul;
  return String(a).localeCompare(String(b), undefined, { numeric: true }) * mul;
}

function cellValue<T>(row: T, column: Column<T>): ReactNode {
  if (column.render) return column.render(row);
  const value = readField(row, column.key);
  if (value == null || value === "") return "—";
  return String(value);
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyTitle = "No data",
  emptyDescription,
  striped = false,
  selectedKey,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string | null>(
    null,
  );
  const activeSelected =
    selectedKey !== undefined ? selectedKey : uncontrolledSelected;

  const sorted = useMemo(() => {
    if (!sort) return data;
    const copy = [...data];
    copy.sort((left, right) =>
      compareValues(readField(left, sort.key), readField(right, sort.key), sort.dir),
    );
    return copy;
  }, [data, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  function handleRowActivate(row: T) {
    if (selectedKey === undefined) setUncontrolledSelected(keyExtractor(row));
    onRowClick?.(row);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleRowActivate(row);
    }
  }

  if (data.length === 0) {
    if (emptyDescription) {
      return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-base">
        <thead className="sticky top-0 z-[1] bg-surface text-muted">
          <tr>
            {columns.map((column) => {
              const sortedHere = sort?.key === column.key;
              const ariaSort = sortedHere
                ? sort.dir === "asc"
                  ? "ascending"
                  : "descending"
                : column.sortable
                  ? "none"
                  : undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={[
                    "border-b border-line px-4 py-3 text-sm font-medium uppercase tracking-wider",
                    column.align === "right" ? "text-right" : "text-left",
                  ].join(" ")}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 transition-colors duration-[var(--duration-fast)] hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                    >
                      {column.label}
                      {sortedHere ? (
                        <span className="text-signal" aria-hidden="true">
                          {sort.dir === "asc" ? "↑" : "↓"}
                        </span>
                      ) : (
                        <span className="text-line" aria-hidden="true">
                          ↕
                        </span>
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => {
            const rowKey = keyExtractor(row);
            const selected = activeSelected === rowKey;
            const numeric = (column: Column<T>) =>
              column.numeric ||
              column.align === "right" ||
              typeof readField(row, column.key) === "number";
            return (
              <tr
                key={rowKey}
                aria-selected={onRowClick ? selected : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => handleRowActivate(row) : undefined}
                onKeyDown={
                  onRowClick ? (event) => handleRowKeyDown(event, row) : undefined
                }
                className={[
                  "border-b border-line text-text",
                  "transition-colors duration-[var(--duration-fast)]",
                  onRowClick
                    ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal"
                    : "",
                  selected
                    ? "bg-signal/5"
                    : [
                        striped && index % 2 === 1 ? "bg-surface/50" : "",
                        "hover:bg-surface-2",
                      ].join(" "),
                ].join(" ")}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      "px-4 py-3",
                      column.align === "right" ? "text-right" : "text-left",
                      numeric(column) ? "tabular-nums" : "",
                    ].join(" ")}
                  >
                    {cellValue(row, column)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
