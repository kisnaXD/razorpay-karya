"use client";

import { useState } from "react";

import type { BadgeTone } from "@/components/ui";
import { Badge } from "@/components/ui";

export type HttpLogEntry = {
  id: string;
  method: string;
  url: string;
  requestBody?: unknown;
  status: number;
  responseBody: unknown;
  durationMs: number;
  at: string;
};

export type HttpRequestLogProps = {
  entries: HttpLogEntry[];
};

function statusTone(status: number): BadgeTone {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "warn";
  if (status >= 500) return "risk";
  return "muted";
}

function JsonHighlight({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  const nodes: Array<string | { cls: string; token: string; i: number }> = [];
  const re =
    /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    let cls = "text-warn";
    if (token.startsWith('"')) {
      cls = token.trimEnd().endsWith(":") ? "text-signal" : "text-teal";
    } else if (token === "true" || token === "false" || token === "null") {
      cls = "text-copper";
    }
    nodes.push({ cls, token, i: i++ });
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return (
    <pre className="mt-2 max-h-48 overflow-auto font-mono text-sm leading-relaxed text-muted">
      {nodes.map((node, idx) =>
        typeof node === "string" ? (
          <span key={`t${idx}`}>{node}</span>
        ) : (
          <span key={node.i} className={node.cls}>
            {node.token}
          </span>
        ),
      )}
    </pre>
  );
}

function LogRow({ entry }: { entry: HttpLogEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="border-b border-line bg-surface px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left transition-colors duration-100 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-mono text-sm text-copper">{entry.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-text">
          {entry.url}
        </span>
        <Badge tone={statusTone(entry.status)}>{String(entry.status)}</Badge>
        <span className="font-mono text-xs tabular-nums text-muted">
          {entry.durationMs}ms
        </span>
      </button>
      {open ? (
        <JsonHighlight
          data={{
            request: entry.requestBody ?? null,
            response: entry.responseBody,
          }}
        />
      ) : null}
    </article>
  );
}

export function HttpRequestLog({ entries }: HttpRequestLogProps) {
  return (
    <section className="flex min-h-0 flex-col" aria-label="HTTP log">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium uppercase tracking-[0.06em] text-muted">
          HTTP log
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Public /a2a/* request · response
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-4 py-4 text-base text-muted">No requests yet.</p>
        ) : (
          entries.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  );
}
