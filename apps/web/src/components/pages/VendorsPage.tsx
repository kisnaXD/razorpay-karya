"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  createNode,
  slugifyKey,
  type ApiNodeFull,
} from "@/lib/api";
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

const INPUT_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-signal";

type VendorRow = {
  key: string;
  name: string;
  location: string;
  materials: string;
  rating: number;
  leadDays: number;
  status: "verified" | "unverified";
  email: string | null;
  notes: string | null;
};

function propString(
  props: ApiNodeFull["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function toRow(org: ApiNodeFull): VendorRow {
  const verified = org.props.verified_bank === true;
  return {
    key: org.key,
    name: org.label,
    location: propString(org.props, "city") ?? "",
    materials: "—",
    rating: verified ? 4.5 : 3.5,
    leadDays: typeof org.props.lead_days === "number" ? org.props.lead_days : 7,
    status: verified ? "verified" : "unverified",
    email: propString(org.props, "email"),
    notes: propString(org.props, "note"),
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
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formVerified, setFormVerified] = useState(false);
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { nodes } = await api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Org");
      setRows(
        nodes
          .filter((n) => propString(n.props, "role") === "vendor")
          .map(toRow)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetCreateForm = () => {
    setFormName("");
    setFormCity("");
    setFormEmail("");
    setFormVerified(false);
    setFormNotes("");
    setFormError(null);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const slug = slugifyKey(name);
    if (!name || !slug) {
      setFormError("Name is required");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const key = `Org:${slug}`;
      await createNode({
        type: "Org",
        key,
        label: name,
        props: {
          role: "vendor",
          verified_bank: formVerified,
          ...(formCity.trim() ? { city: formCity.trim() } : {}),
          ...(formEmail.trim() ? { email: formEmail.trim() } : {}),
          ...(formNotes.trim() ? { note: formNotes.trim() } : {}),
        },
      });
      setCreateOpen(false);
      resetCreateForm();
      await load();
      setSelectedKey(key);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create vendor",
      );
    } finally {
      setSubmitting(false);
    }
  };

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
      <PageHeader
        title="Vendors"
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
            + New Vendor
          </Button>
        }
      />
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

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-vendor-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-vendor-title"
                  className="text-base font-medium text-text"
                >
                  New Vendor
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Add a supplier organization to the graph.
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
                  placeholder="Shree Metal Works"
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  City
                </span>
                <input
                  className={INPUT_CLASS}
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  placeholder="Aligarh"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Email
                </span>
                <input
                  className={INPUT_CLASS}
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="sales@example.com"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={formVerified}
                  onChange={(e) => setFormVerified(e.target.checked)}
                  className="rounded border-line"
                />
                Verified Bank
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Notes
                </span>
                <textarea
                  className={`${INPUT_CLASS} min-h-[72px] resize-y`}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional notes"
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
                  {submitting ? "Creating…" : "Create Vendor"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
