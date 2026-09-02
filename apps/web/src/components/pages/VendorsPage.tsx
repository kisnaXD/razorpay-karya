"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSourcingVendors,
  type SourcingVendorHit,
} from "@/lib/api";
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

type VendorRow = {
  key: string;
  name: string;
  location: string;
  materials: string;
  rating: number;
  leadDays: number;
  status: "verified" | "unverified";
};

function materialLabel(key: string): string {
  return key.includes(":") ? key.split(":")[1]! : key;
}

function toRow(vendor: SourcingVendorHit): VendorRow {
  return {
    key: vendor.orgKey,
    name: vendor.label,
    location: vendor.city,
    materials: vendor.materialKeys.map(materialLabel).join(", "),
    rating: Math.max(1, 5 - vendor.rank + (vendor.verified_bank ? 0.5 : 0)),
    leadDays: vendor.leadDays,
    status: vendor.verified_bank ? "verified" : "unverified",
  };
}

const columns: Column<VendorRow>[] = [
  {
    key: "name",
    label: "Vendor Name",
    sortable: true,
    render: (row) => row.name,
  },
  {
    key: "location",
    label: "Location",
    sortable: true,
    width: "120px",
    render: (row) => row.location || "—",
  },
  {
    key: "materials",
    label: "Materials Supplied",
    sortable: true,
    render: (row) => row.materials || "—",
  },
  {
    key: "rating",
    label: "Rating",
    sortable: true,
    width: "90px",
    align: "right",
    numeric: true,
    render: (row) => (
      <span className="font-mono tabular-nums">{row.rating.toFixed(1)}</span>
    ),
  },
  {
    key: "leadDays",
    label: "Lead Time",
    sortable: true,
    width: "100px",
    align: "right",
    numeric: true,
    render: (row) => (
      <span className="font-mono tabular-nums">{row.leadDays}d</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <StatusDot
          status={row.status === "verified" ? "paid" : "draft"}
          size="sm"
        />
        {row.status === "verified" ? "Verified" : "Unverified"}
      </span>
    ),
  },
];

export function VendorsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { vendors } = await fetchSourcingVendors(
        "Material:BrassSheet-22g",
        5,
      );
      setRows(vendors.map(toRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    return `${rows.length} ${rows.length === 1 ? "vendor" : "vendors"}`;
  }, [loading, rows.length]);

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title="Vendors" />
        <EmptyState
          title="Couldn’t load vendors"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Vendors" subtitle={subtitle} />
      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={(row) => row.key}
          selectedKey={selectedKey}
          onRowClick={(row) => {
            setSelectedKey(row.key);
            onNavigate(row.key);
          }}
          emptyTitle="No vendors"
          emptyDescription="Vendor directory entries will appear here once sourcing data is available."
        />
      )}
    </div>
  );
}
