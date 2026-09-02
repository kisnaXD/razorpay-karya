"use client";

import { useState } from "react";
import type { MorningBriefing } from "@/lib/api";

export type BriefingBannerProps = {
  briefing: MorningBriefing;
};

const DOMAIN_LABEL: Record<string, string> = {
  finance: "Finance",
  procurement: "Procurement",
  sales: "Sales",
  inventory: "Inventory",
};

function domainLine(byDomain: Record<string, number>): string | null {
  const parts = Object.entries(byDomain)
    .filter(([, n]) => n > 0)
    .map(([domain, n]) => `${n} in ${DOMAIN_LABEL[domain] ?? domain}`);
  return parts.length > 0 ? parts.join(" • ") : null;
}

export function BriefingBanner({ briefing }: BriefingBannerProps) {
  const [expanded, setExpanded] = useState(true);
  const domains = domainLine(briefing.byDomain);

  return (
    <div
      className={[
        "border-b border-line px-4 py-3",
        "bg-gradient-to-r from-signal/10 via-surface-2 to-teal/5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-text">
            {briefing.greeting}. {briefing.summary}
          </p>
          {expanded && domains && briefing.topItems.length > 0 ? (
            <p className="mt-1 text-sm text-muted">{domains}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          aria-expanded={expanded}
        >
          {expanded ? "▼ Hide" : "▶ Show"}
        </button>
      </div>
    </div>
  );
}
