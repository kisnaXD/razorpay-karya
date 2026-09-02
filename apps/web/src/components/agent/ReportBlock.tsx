"use client";

export type TableContent = {
  columns: string[];
  rows: string[][];
};

export type MetricContent = {
  label: string;
  value: string;
  trend?: string;
  detail?: string;
};

export type ReportSection = {
  heading: string;
  kind: "markdown" | "table" | "metric";
  content: string | TableContent | MetricContent;
};

export type ReportSpec = {
  title: string;
  generatedAt: string;
  sections: ReportSection[];
};

export type ReportBlockProps = {
  report: ReportSpec;
};

function isMetricContent(content: ReportSection["content"]): content is MetricContent {
  return typeof content === "object" && content !== null && "value" in content && "label" in content;
}

function isTableContent(content: ReportSection["content"]): content is TableContent {
  return typeof content === "object" && content !== null && "columns" in content && "rows" in content;
}

function trendArrow(trend?: string): { symbol: string; className: string } | null {
  if (trend === "up") return { symbol: "↑", className: "text-teal" };
  if (trend === "down") return { symbol: "↓", className: "text-risk" };
  if (trend === "stable") return { symbol: "→", className: "text-muted" };
  return null;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricSection({ heading, content }: { heading: string; content: MetricContent }) {
  const trend = trendArrow(content.trend);
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        {heading}
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[140px] flex-1 rounded-md border border-line bg-surface px-3 py-2.5">
          <p className="text-[11px] text-muted">{content.label}</p>
          <p className="mt-1 flex items-baseline gap-2 font-mono text-lg font-medium tabular-nums text-text">
            {content.value}
            {trend ? (
              <span className={`text-sm ${trend.className}`} aria-label={`trend ${content.trend}`}>
                {trend.symbol}
              </span>
            ) : null}
          </p>
          {content.detail ? (
            <p className="mt-1 text-[11px] leading-snug text-muted">{content.detail}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TableSection({ heading, content }: { heading: string; content: TableContent }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        {heading}
      </p>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[280px] border-collapse text-xs">
          <thead>
            <tr className="bg-surface text-left text-[10px] uppercase tracking-wider text-muted">
              {content.columns.map((col) => (
                <th key={col} className="px-2 py-1.5 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(content.columns.length, 1)}
                  className="px-2 py-2 text-muted"
                >
                  No rows
                </td>
              </tr>
            ) : (
              content.rows.map((row, i) => (
                <tr
                  key={`${row[0] ?? i}-${i}`}
                  className={i % 2 === 0 ? "bg-surface-2/40" : "bg-surface"}
                >
                  {row.map((cell, j) => (
                    <td
                      key={`${i}-${j}`}
                      className="px-2 py-1.5 font-mono tabular-nums text-text"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarkdownSection({ heading, content }: { heading: string; content: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        {heading}
      </p>
      <div className="whitespace-pre-wrap text-[12px] leading-[1.5] text-text">
        {content}
      </div>
    </div>
  );
}

export function ReportBlock({ report }: ReportBlockProps) {
  return (
    <div className="w-full max-w-[95%] overflow-hidden rounded-lg border border-line bg-surface-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <h3 className="text-[13px] font-semibold text-text">{report.title}</h3>
        <time
          dateTime={report.generatedAt}
          className="shrink-0 text-[10px] tabular-nums text-muted"
        >
          {formatTimestamp(report.generatedAt)}
        </time>
      </div>
      <div className="space-y-3 px-3 py-3">
        {report.sections.map((section, i) => {
          const key = `${section.heading}-${i}`;
          if (section.kind === "metric" && isMetricContent(section.content)) {
            return (
              <MetricSection
                key={key}
                heading={section.heading}
                content={section.content}
              />
            );
          }
          if (section.kind === "table" && isTableContent(section.content)) {
            return (
              <TableSection
                key={key}
                heading={section.heading}
                content={section.content}
              />
            );
          }
          if (section.kind === "markdown" && typeof section.content === "string") {
            return (
              <MarkdownSection
                key={key}
                heading={section.heading}
                content={section.content}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export function isReportSpec(output: unknown): output is ReportSpec {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.generatedAt === "string" &&
    Array.isArray(o.sections)
  );
}
