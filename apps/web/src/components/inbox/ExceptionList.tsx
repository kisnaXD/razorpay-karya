"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchInbox,
  type ApiException,
  type InboxAction,
  type MorningBriefing,
} from "@/lib/api";
import { EmptyState } from "@/components/ui";
import { AgentInboxItem } from "./AgentInboxItem";
import { BriefingBanner } from "./BriefingBanner";

export type AgentInboxProps = {
  onAction: (action: InboxAction) => void;
  onNavigate?: (nodeKey: string) => void;
  /** @deprecated Prefer onAction; kept for older callers */
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
  exceptions?: ApiException[];
  nodeKeyById?: Map<string, string>;
};

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const;

const PRIORITY_TITLE: Record<(typeof PRIORITY_ORDER)[number], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function CheckIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5 10.5 15l5.5-6" />
    </svg>
  );
}

function groupByPriority(
  exceptions: ApiException[],
): Record<(typeof PRIORITY_ORDER)[number], ApiException[]> {
  const groups: Record<(typeof PRIORITY_ORDER)[number], ApiException[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const ex of exceptions) {
    const p = ex.priority ?? "low";
    if (p === "critical" || p === "high" || p === "medium" || p === "low") {
      groups[p].push(ex);
    } else {
      groups.low.push(ex);
    }
  }
  return groups;
}

export function AgentInbox({
  onAction,
  onNavigate,
  onSelect,
  exceptions: exceptionsProp,
}: AgentInboxProps) {
  const [exceptions, setExceptions] = useState<ApiException[]>(
    exceptionsProp ?? [],
  );
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [loading, setLoading] = useState(!exceptionsProp);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (exceptionsProp) {
      setExceptions(exceptionsProp);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchInbox();
        if (cancelled) return;
        setExceptions(res.exceptions);
        setBriefing(res.briefing);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load inbox");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [exceptionsProp]);

  const groups = useMemo(() => groupByPriority(exceptions), [exceptions]);

  const handleAction = useCallback(
    (action: InboxAction) => {
      if (action.kind === "navigate") {
        const key = action.payload.nodeKey;
        if (key) {
          onNavigate?.(key);
          onSelect?.(key);
        }
      }
      onAction(action);
    },
    [onAction, onNavigate, onSelect],
  );

  return (
    <section className="flex min-h-0 flex-col" aria-label="Agent inbox">
      <header className="border-b border-line px-4 py-2">
        <h2 className="text-md font-medium text-text">Inbox</h2>
      </header>

      {briefing ? <BriefingBanner briefing={briefing} /> : null}

      {loading ? (
        <p className="px-4 py-3 text-sm text-muted">Loading inbox…</p>
      ) : null}

      {error ? (
        <p className="px-4 py-3 text-sm text-risk">{error}</p>
      ) : null}

      {!loading && !error && exceptions.length === 0 ? (
        <EmptyState
          icon={<CheckIcon />}
          title="All clear"
          description="No exceptions need attention right now."
        />
      ) : null}

      {!loading && exceptions.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {PRIORITY_ORDER.map((priority) => {
            const items = groups[priority];
            if (items.length === 0) return null;
            return (
              <div key={priority}>
                <h3 className="border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted">
                  {PRIORITY_TITLE[priority]} · {items.length}
                </h3>
                <div>
                  {items.map((ex) => (
                    <AgentInboxItem
                      key={ex.id}
                      exception={ex}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/** @deprecated Use AgentInbox */
export const ExceptionList = AgentInbox;
