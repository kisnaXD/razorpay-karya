"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";
import {
  createEdge,
  createNode,
  slugifyKey,
} from "@/lib/api";
import { formatQty } from "@/lib/format";
import { loadGraphSnapshot } from "@/lib/graph-data";
import {
  buildCatalogItems,
  type CatalogItem,
  type ItemCategory,
} from "./inventory-data";

const WORKSHOP_LOCATION_KEY = "Location:Workshop";

const INPUT_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-signal";

type CategoryFilter = "All" | ItemCategory;

function numCell(value: number | null, low?: boolean) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span
      className={[
        "font-mono tabular-nums",
        low ? "text-risk" : "",
      ].join(" ")}
    >
      {value}
    </span>
  );
}

const columns: Column<CatalogItem>[] = [
  {
    key: "name",
    label: "Item Name",
    sortable: true,
            render: (row) => (
      <span
        className={[
          "inline-flex flex-col gap-0.5",
          row.lowStock ? "text-risk" : "",
        ].join(" ")}
      >
        <span className={row.lowStock ? "text-risk" : "text-text"}>
          {row.name}
        </span>
        <span className="font-mono text-xs text-muted">{row.key}</span>
      </span>
    ),
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    width: "110px",
    render: (row) => (
      <Badge tone={row.type === "SKU" ? "accent" : "muted"}>{row.type}</Badge>
    ),
  },
  {
    key: "unit",
    label: "Unit",
    sortable: true,
    width: "80px",
    render: (row) => <span className="text-muted">{row.unit}</span>,
  },
  {
    key: "onHand",
    label: "On Hand",
    sortable: true,
    align: "right",
    numeric: true,
    width: "100px",
    render: (row) => numCell(row.onHand),
  },
  {
    key: "reserved",
    label: "Reserved",
    sortable: true,
    align: "right",
    numeric: true,
    width: "100px",
    render: (row) => numCell(row.reserved),
  },
  {
    key: "available",
    label: "Available",
    sortable: true,
    align: "right",
    numeric: true,
    width: "110px",
    render: (row) =>
      row.available === null ? (
        <span className="text-muted">—</span>
      ) : (
        <span
          className={[
            "font-mono tabular-nums",
            row.lowStock ? "text-risk" : "text-teal",
          ].join(" ")}
        >
          {formatQty(row.available, row.unit)}
        </span>
      ),
  },
  {
    key: "reorderPoint",
    label: "Reorder Point",
    sortable: true,
    align: "right",
    numeric: true,
    width: "120px",
    render: (row) => numCell(row.reorderPoint),
  },
  {
    key: "lowStock",
    label: "Status",
    sortable: true,
    width: "140px",
    render: (row) => {
      if (row.lowStock) {
        return (
          <span className="inline-flex items-center gap-2">
            <StatusDot status="low" size="sm" />
            <Badge tone="risk">Low Stock</Badge>
          </span>
        );
      }
      if (row.available !== null && row.available > 0) {
        return (
          <span className="inline-flex items-center gap-2">
            <StatusDot status="ok" size="sm" />
            <span className="text-teal">In stock</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-2">
          <StatusDot status="draft" size="sm" />
          <span className="text-muted">—</span>
        </span>
      );
    },
  },
];

export function ItemsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formGst, setFormGst] = useState("12");
  const [formDescription, setFormDescription] = useState("");
  const [formLeadDays, setFormLeadDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await loadGraphSnapshot();
      setItems(buildCatalogItems(snapshot));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetCreateForm = () => {
    setFormName("");
    setFormPrice("");
    setFormGst("12");
    setFormDescription("");
    setFormLeadDays("7");
    setFormError(null);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const slug = slugifyKey(name);
    const priceRupees = Number(formPrice);
    const gst = Number(formGst);
    const leadDays = Number(formLeadDays);
    if (!name || !slug) {
      setFormError("Name is required");
      return;
    }
    if (!Number.isFinite(priceRupees) || priceRupees < 0) {
      setFormError("Price is required");
      return;
    }

    const key = `SKU:${slug}`;
    const stockKey = `Stock:${slug}@Workshop`;
    const priceInPaise = Math.round(priceRupees * 100);

    setSubmitting(true);
    setFormError(null);
    try {
      await createNode({
        type: "SKU",
        key,
        label: name,
        props: {
          priceInPaise,
          gst: Number.isFinite(gst) ? gst : 12,
          ...(formDescription.trim()
            ? { description: formDescription.trim() }
            : {}),
          ...(Number.isFinite(leadDays) ? { lead_days: leadDays } : {}),
        },
      });
      await createNode({
        type: "Stock",
        key: stockKey,
        label: `${name} @ Workshop`,
        props: {
          on_hand: 0,
          reserved: 0,
        },
      });
      await createEdge({
        type: "STOCK_OF",
        fromKey: stockKey,
        toKey: key,
      });
      try {
        await createEdge({
          type: "LOCATED_AT",
          fromKey: stockKey,
          toKey: WORKSHOP_LOCATION_KEY,
        });
      } catch {
        // Workshop may be missing in empty graphs
      }
      setCreateOpen(false);
      resetCreateForm();
      await load();
      setSelectedKey(key);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create item",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const categoriesPresent = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return set;
  }, [items]);

  const showFilters =
    categoriesPresent.has("Raw Materials") &&
    categoriesPresent.has("Finished Goods");

  const filtered = useMemo(() => {
    if (category === "All") return items;
    return items.filter((i) => i.category === category);
  }, [items, category]);

  const lowCount = filtered.filter((i) => i.lowStock).length;
  const subtitle = loading
    ? "Loading…"
    : `${filtered.length} ${filtered.length === 1 ? "item" : "items"}${
        lowCount > 0 ? ` · ${lowCount} low stock` : ""
      }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Items"
        subtitle={subtitle}
        trailing={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            + New Item
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3 px-5 py-5">
          <div className="h-8 w-64 animate-pulse rounded-[var(--radius-sm)] bg-surface-2" />
          <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load items"
            description={error}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void load()}
              >
                Retry
              </Button>
            }
          />
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {showFilters ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              {(
                ["All", "Raw Materials", "Finished Goods"] as CategoryFilter[]
              ).map((c) => (
                <FilterChip
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </FilterChip>
              ))}
            </div>
          ) : null}

          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(row) => row.key}
            selectedKey={selectedKey}
            onRowClick={(row) => {
              setSelectedKey(row.key);
              onNavigate(row.key);
            }}
            emptyTitle="No items"
            emptyDescription="SKU and Material nodes will appear here once they exist on the graph."
          />
        </>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-item-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-item-title"
                  className="text-base font-medium text-text"
                >
                  New Item
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Create a finished SKU with zero opening stock.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
              >
                Close
              </Button>
            </div>

            <form className="space-y-4" onSubmit={onSubmitCreate}>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Name
                </span>
                <input
                  className={INPUT_CLASS}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Diya Large"
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Price (₹)
                </span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min="0"
                  step="0.01"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="450"
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  GST %
                </span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min="0"
                  step="1"
                  value={formGst}
                  onChange={(e) => setFormGst(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Description
                </span>
                <textarea
                  className={`${INPUT_CLASS} min-h-[72px] resize-y`}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Lead Days
                </span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min="0"
                  step="1"
                  value={formLeadDays}
                  onChange={(e) => setFormLeadDays(e.target.value)}
                />
              </label>

              {formError ? (
                <p className="text-sm text-risk">{formError}</p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreateOpen(false);
                    resetCreateForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submitting}
                >
                  {submitting ? "Creating…" : "Create Item"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
