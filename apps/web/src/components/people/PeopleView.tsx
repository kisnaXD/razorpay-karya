"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOrgTimeline,
  fetchPeopleOrgs,
  type ApiNodeFull,
  type TimelineEntryDto,
} from "@/lib/api";
import { useConsole } from "@/lib/console-context";
import {
  EmptyState,
  FilterChip,
  PageHeader,
  Tooltip,
} from "@/components/ui";

const DEFAULT_ORG = "Org:Meenakshi-Brass";

const KIND_FILTERS: TimelineEntryDto["kind"][] = [
  "message",
  "order",
  "payment",
  "meeting",
  "invoice",
];

function orgInitials(label: string): string {
  const cleaned = label.replace(/^Org:/, "");
  const parts = cleaned.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

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

function fullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function KindIcon({ kind }: { kind: TimelineEntryDto["kind"] }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    "aria-hidden": true as const,
  };
  switch (kind) {
    case "message":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" rx="1" />
          <path d="M2 5l6 4 6-4" />
        </svg>
      );
    case "payment":
      return (
        <svg {...common}>
          <rect x="2" y="4" width="12" height="8" rx="1" />
          <circle cx="8" cy="8" r="1.5" />
        </svg>
      );
    case "order":
      return (
        <svg {...common}>
          <path d="M4 2h8l1 12H3L4 2z" />
          <path d="M6 6h4" />
        </svg>
      );
    case "meeting":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="11" />
          <path d="M2 6h12M5 1.5V4M11 1.5V4" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...common}>
          <path d="M4 2h8v12H4z" />
          <path d="M6 5h4M6 8h4M6 11h2" />
        </svg>
      );
  }
}

export function PeopleView() {
  const { focusNode } = useConsole();
  const [orgs, setOrgs] = useState<ApiNodeFull[]>([]);
  const [selectedKey, setSelectedKey] = useState(DEFAULT_ORG);
  const [entries, setEntries] = useState<TimelineEntryDto[]>([]);
  const [kindFilter, setKindFilter] = useState<"all" | TimelineEntryDto["kind"]>(
    "all",
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (orgKey: string) => {
    try {
      setError(null);
      const [orgRes, timeline] = await Promise.all([
        fetchPeopleOrgs(),
        fetchOrgTimeline(orgKey),
      ]);
      setOrgs(orgRes.orgs);
      setEntries(timeline.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people");
    }
  }, []);

  useEffect(() => {
    void load(selectedKey);
  }, [load, selectedKey]);

  const presentKinds = useMemo(() => {
    const set = new Set(entries.map((e) => e.kind));
    return KIND_FILTERS.filter((k) => set.has(k));
  }, [entries]);

  const visible = useMemo(
    () =>
      kindFilter === "all"
        ? entries
        : entries.filter((e) => e.kind === kindFilter),
    [entries, kindFilter],
  );

  const selectedOrg = orgs.find((o) => o.key === selectedKey);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="People"
    >
      <PageHeader
        title="People"
        subtitle="Orgs on the graph"
        trailing={
          selectedOrg ? (
            <span className="inline-flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal/10 text-xs font-medium text-signal">
                {orgInitials(selectedOrg.label)}
              </span>
              <span className="text-sm text-muted">{selectedOrg.label}</span>
            </span>
          ) : null
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr] overflow-hidden">
        <aside className="overflow-auto border-r border-line">
          <ul className="py-2">
            {orgs.map((org) => {
              const active = org.key === selectedKey;
              return (
                <li key={org.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setKindFilter("all");
                      setSelectedKey(org.key);
                    }}
                    className={[
                      "flex w-full items-center gap-2 px-4 py-2 text-left text-base transition-colors duration-100",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                      active
                        ? "border-l-2 border-l-signal bg-surface text-text"
                        : "border-l-2 border-l-transparent text-muted hover:text-text",
                    ].join(" ")}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal/10 text-xs font-medium text-signal">
                      {orgInitials(org.label)}
                    </span>
                    <span className="truncate">{org.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="flex min-h-0 flex-col overflow-auto">
          <header className="shrink-0 border-b border-line px-5 py-3">
            <h2 className="text-md font-medium text-text">Timeline</h2>
            <p className="mt-0.5 font-mono text-sm text-muted">{selectedKey}</p>
            {presentKinds.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterChip
                  active={kindFilter === "all"}
                  onClick={() => setKindFilter("all")}
                >
                  All
                </FilterChip>
                {presentKinds.map((kind) => (
                  <FilterChip
                    key={kind}
                    active={kindFilter === kind}
                    onClick={() => setKindFilter(kind)}
                  >
                    {kind}
                  </FilterChip>
                ))}
              </div>
            ) : null}
          </header>
          {error ? <p className="px-5 py-3 text-sm text-muted">{error}</p> : null}
          {visible.length === 0 && !error ? (
            <EmptyState
              title="No activity yet"
              description="Events linked to this org will show up here."
            />
          ) : (
            <ul className="relative ml-7 border-l border-line py-2">
              {visible.map((entry) => (
                <li key={entry.nodeKey} className="relative">
                  <button
                    type="button"
                    onClick={() => focusNode(entry.nodeKey)}
                    className="flex w-full flex-col gap-1 py-3 pl-6 pr-5 text-left transition-colors duration-100 hover:bg-surface/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                  >
                    <span className="absolute -left-[13px] top-4 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted">
                      <KindIcon kind={entry.kind} />
                    </span>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-base text-text">{entry.label}</span>
                      <Tooltip label={fullTimestamp(entry.at)}>
                        <time
                          dateTime={entry.at}
                          className="font-mono text-xs text-muted tabular-nums"
                        >
                          {relativeTime(entry.at)}
                        </time>
                      </Tooltip>
                    </div>
                    <span className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
                      {entry.kind}
                    </span>
                    <span className="text-sm text-muted">{entry.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
