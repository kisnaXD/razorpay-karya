import { describe, expect, it } from "vitest";
import { buildMorningBriefing } from "./briefing.js";
import { enrichExceptions } from "./inbox-enrichment.js";
import type { Exception } from "./types.js";

function ex(
  partial: Partial<Exception> & Pick<Exception, "id" | "code" | "severity" | "title">,
): Exception {
  return enrichExceptions([
    {
      nodeId: partial.nodeId ?? partial.id,
      nodeKey: partial.nodeKey ?? `Key:${partial.id}`,
      detail: partial.detail ?? "detail",
      ...partial,
    },
  ])[0]!;
}

describe("buildMorningBriefing", () => {
  it("returns all-clear when empty", () => {
    const briefing = buildMorningBriefing([]);
    expect(briefing.greeting).toBe("All clear");
    expect(briefing.summary).toMatch(/No items/i);
    expect(briefing.topItems).toEqual([]);
  });

  it("lists titles for 1–3 items", () => {
    const items = [
      ex({
        id: "1",
        code: "invoice.overdue",
        severity: "risk",
        title: "INV-104 is overdue",
      }),
      ex({
        id: "2",
        code: "po.late",
        severity: "warn",
        title: "PO-104 is late",
      }),
    ];
    const briefing = buildMorningBriefing(items);
    expect(briefing.greeting).toBe("Good morning");
    expect(briefing.summary).toContain("2 items");
    expect(briefing.summary).toContain("INV-104 is overdue");
    expect(briefing.topItems).toHaveLength(2);
    expect(briefing.topItems[0]?.priority).toBe("critical");
  });

  it("uses domain breakdown for 4+ items", () => {
    const items = [
      ex({
        id: "1",
        code: "invoice.overdue",
        severity: "risk",
        title: "A",
      }),
      ex({
        id: "2",
        code: "payment.failure",
        severity: "risk",
        title: "B",
      }),
      ex({
        id: "3",
        code: "po.late",
        severity: "warn",
        title: "C",
      }),
      ex({
        id: "4",
        code: "stock.promise_risk",
        severity: "risk",
        title: "D",
      }),
    ];
    const briefing = buildMorningBriefing(items);
    expect(briefing.greeting).toBe("Good morning");
    expect(briefing.summary).toContain("4 things");
    expect(briefing.summary).toMatch(/Finance/);
    expect(briefing.byDomain.finance).toBe(2);
    expect(briefing.topItems).toHaveLength(3);
    expect(briefing.topItems[0]?.priority).toBe("critical");
  });
});
