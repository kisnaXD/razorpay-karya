"use client";

import { useEffect, useState } from "react";
import { fetchAuditFiltered, type AuditEventDto } from "@/lib/api";

export type ToolTraceRow = {
  id: string;
  tool: string;
  status: "running" | "done" | "error";
  summary: string;
  at: string;
};

function rowsFromAudit(events: AuditEventDto[]): ToolTraceRow[] {
  return events
    .filter((e) => {
      const t = String(e.props.event_type ?? "");
      return t.startsWith("money.") || t.startsWith("collections.");
    })
    .slice(0, 8)
    .map((e) => ({
      id: e._id,
      tool: String(e.props.event_type),
      status: "done" as const,
      summary: String(e.props.actor ?? ""),
      at: String(e.props.at ?? ""),
    }));
}

export function ToolTrace() {
  const [rows, setRows] = useState<ToolTraceRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const events = await fetchAuditFiltered({
          actor: "agent:money",
          limit: 10,
        });
        setRows(rowsFromAudit(events));
      } catch {
        setRows([]);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5" aria-label="Money tool trace">
      {rows.map((row) => (
        <div key={row.id} className="flex items-start gap-2">
          <span
            className={[
              "mt-1.5 inline-block h-1.5 w-1.5 shrink-0",
              row.status === "done" ? "bg-teal" : "bg-copper",
            ].join(" ")}
          />
          <div>
            <div className="font-mono text-[12px] text-text">{row.tool}</div>
            <div className="text-[13px] text-muted">{row.summary}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
