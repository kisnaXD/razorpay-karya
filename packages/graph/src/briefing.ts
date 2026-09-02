import type { Exception } from "./types.js";

export type MorningBriefing = {
  greeting: string;
  summary: string;
  byDomain: Record<string, number>;
  topItems: Exception[];
  generatedAt: string;
};

const PRIORITY_RANK: Record<NonNullable<Exception["priority"]>, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const DOMAIN_LABEL: Record<string, string> = {
  finance: "Finance",
  procurement: "Procurement",
  sales: "Sales",
  inventory: "Inventory",
};

function sortByPriority(exceptions: Exception[]): Exception[] {
  return [...exceptions].sort((a, b) => {
    const aRank = PRIORITY_RANK[a.priority ?? "low"] ?? 3;
    const bRank = PRIORITY_RANK[b.priority ?? "low"] ?? 3;
    return aRank - bRank;
  });
}

function countByDomain(exceptions: Exception[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ex of exceptions) {
    const domain = ex.domain ?? "inventory";
    counts[domain] = (counts[domain] ?? 0) + 1;
  }
  return counts;
}

function domainBreakdown(byDomain: Record<string, number>): string {
  return Object.entries(byDomain)
    .filter(([, n]) => n > 0)
    .map(([domain, n]) => {
      const label = DOMAIN_LABEL[domain] ?? domain;
      return `${n} in ${label}`;
    })
    .join(", ");
}

export function buildMorningBriefing(
  exceptions: Exception[],
): MorningBriefing {
  const byDomain = countByDomain(exceptions);
  const topItems = sortByPriority(exceptions).slice(0, 3);
  const generatedAt = new Date().toISOString();
  const n = exceptions.length;

  if (n === 0) {
    return {
      greeting: "All clear",
      summary: "No items need attention right now.",
      byDomain,
      topItems,
      generatedAt,
    };
  }

  if (n <= 3) {
    const titles = exceptions.map((ex) => ex.title).join("; ");
    return {
      greeting: "Good morning",
      summary: `${n} items need your attention. ${titles}`,
      byDomain,
      topItems,
      generatedAt,
    };
  }

  const breakdown = domainBreakdown(byDomain);
  return {
    greeting: "Good morning",
    summary: `${n} things need attention.${breakdown ? ` ${breakdown}` : ""}`,
    byDomain,
    topItems,
    generatedAt,
  };
}
