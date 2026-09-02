"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAuditFiltered,
  type AuditEventDto,
} from "@/lib/api";
import { formatInr } from "@/lib/format";
import { Badge, EmptyState, FilterChip } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";

const ACTOR_CHIPS = [
  { id: "all", label: "All actors" },
  { id: "agent:money", label: "agent:money" },
  { id: "webhook:razorpay", label: "webhook:razorpay" },
  { id: "human:anika@arka.atelier", label: "human:anika" },
] as const;

const SIDE_CHIPS = [
  { id: "all", label: "All effects" },
  { id: "money", label: "money" },
  { id: "write", label: "write" },
  { id: "read", label: "read" },
] as const;

function payloadEntries(raw: string): Array<[string, string]> {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        typeof v === "object" ? JSON.stringify(v) : String(v),
      ]);
    }
    return [["value", String(obj)]];
  } catch {
    return [["raw", raw]];
  }
}

function amountFromEvent(ev: AuditEventDto): number | null {
  try {
    const payload = JSON.parse(String(ev.props.payload_json)) as {
      amountInPaise?: number;
      amount?: number;
    };
    return payload.amountInPaise ?? payload.amount ?? null;
  } catch {
    return null;
  }
}

function eventTone(eventType: string): BadgeTone {
  if (eventType.includes("fail") || eventType.includes("expir")) return "risk";
  if (eventType.includes("approval") || eventType.includes("pending")) {
    return "warn";
  }
  if (
    eventType.includes("paid") ||
    eventType.includes("captured") ||
    eventType.includes("created")
  ) {
    return "success";
  }
  return "accent";
}

export function AuditExplorer() {
  const [actor, setActor] = useState<string>("all");
  const [side, setSide] = useState<string>("all");
  const [minAmount, setMinAmount] = useState<string>("");
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const minPaise =
      minAmount.trim() === ""
        ? undefined
        : Math.round(Number.parseFloat(minAmount) * 100);
    const list = await fetchAuditFiltered({
      ...(actor !== "all" ? { actor } : {}),
      ...(side !== "all" ? { sideEffectClass: side } : {}),
      ...(minPaise !== undefined && !Number.isNaN(minPaise)
        ? { minAmountPaise: minPaise }
        : {}),
      limit: 40,
    });
    setEvents(list);
  }, [actor, side, minAmount]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="border-t border-line" aria-label="Audit explorer">
      <header className="px-5 py-4">
        <h2 className="text-md font-medium text-text">Audit explorer</h2>
        <p className="mt-0.5 text-sm text-muted">
          Filter the money trail by actor, side-effect, and amount.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 px-5 pb-3">
        {ACTOR_CHIPS.map((chip) => (
          <FilterChip
            key={chip.id}
            active={actor === chip.id}
            onClick={() => setActor(chip.id)}
          >
            {chip.label}
          </FilterChip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
        {SIDE_CHIPS.map((chip) => (
          <FilterChip
            key={chip.id}
            active={side === chip.id}
            onClick={() => setSide(chip.id)}
          >
            {chip.label}
          </FilterChip>
        ))}
        <label className="ml-1 flex items-center gap-1.5 font-mono text-xs text-muted">
          Min ₹
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="h-7 w-20 rounded-[var(--radius-sm)] border border-line bg-transparent px-2 text-text transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            placeholder="0"
          />
        </label>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No audit events match these filters"
          description="Try another actor, side-effect class, or clear the minimum amount."
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {events.map((ev) => {
            const amount = amountFromEvent(ev);
            const open = expanded === ev._id;
            const eventType = String(ev.props.event_type);
            const rows = open
              ? payloadEntries(String(ev.props.payload_json))
              : [];
            return (
              <li key={ev._id}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : ev._id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors duration-100 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone={eventTone(eventType)}>{eventType}</Badge>
                    <span className="truncate font-mono text-xs text-muted">
                      {String(ev.props.actor)}
                    </span>
                  </span>
                  {amount != null ? (
                    <span className="shrink-0 font-mono text-sm tabular-nums text-text">
                      {formatInr(amount)}
                    </span>
                  ) : null}
                </button>
                {open ? (
                  <div className="mx-5 mb-3 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
                    <table className="w-full text-left">
                      <tbody>
                        {rows.map(([k, v]) => (
                          <tr key={k} className="border-b border-line last:border-b-0">
                            <th className="w-40 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted">
                              {k}
                            </th>
                            <td className="px-3 py-1.5 font-mono text-sm text-text">
                              {v}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
