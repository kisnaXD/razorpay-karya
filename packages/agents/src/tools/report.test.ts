import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";
import {
  generateReport,
  type ReportSection,
  type ReportSpec,
  type ReportTemplate,
  type TableContent,
} from "./report.js";

const ORG = "org_arka";

const TEMPLATES: ReportTemplate[] = [
  "cash_flow_forecast",
  "collections_priority",
  "inventory_health",
  "sales_pipeline",
  "vendor_performance",
];

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_report_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();
  await seedArkaAtelier(store, db);
});

function assertValidReport(report: ReportSpec) {
  expect(typeof report.title).toBe("string");
  expect(report.title.length).toBeGreaterThan(0);
  expect(typeof report.generatedAt).toBe("string");
  expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
  expect(Array.isArray(report.sections)).toBe(true);
  expect(report.sections.length).toBeGreaterThan(0);
  for (const section of report.sections) {
    expect(typeof section.heading).toBe("string");
    expect(["markdown", "table", "metric"]).toContain(section.kind);
    expect(section.content).toBeDefined();
  }
}

function tableSection(
  report: ReportSpec,
  headingIncludes: string,
): TableContent {
  const section = report.sections.find(
    (s) =>
      s.kind === "table" &&
      s.heading.toLowerCase().includes(headingIncludes.toLowerCase()),
  );
  expect(section).toBeDefined();
  return section!.content as TableContent;
}

function metricSection(report: ReportSpec): ReportSection {
  const section = report.sections.find((s) => s.kind === "metric");
  expect(section).toBeDefined();
  return section!;
}

describe("generateReport", () => {
  it.each(TEMPLATES)(
    "%s returns a valid ReportSpec structure",
    async (template) => {
      const report = await generateReport(store, ORG, { template });
      assertValidReport(report);
    },
  );

  it("cash_flow_forecast has receivables and payables sections", async () => {
    const report = await generateReport(store, ORG, {
      template: "cash_flow_forecast",
    });
    assertValidReport(report);
    expect(report.title.toLowerCase()).toContain("cash");

    const recv = tableSection(report, "receivable");
    expect(recv.columns.length).toBeGreaterThan(0);
    expect(recv.rows.some((r) => r.some((c) => c.includes("INV-90")))).toBe(
      true,
    );

    const pay = tableSection(report, "payable");
    expect(pay.columns.length).toBeGreaterThan(0);
    expect(pay.rows.some((r) => r.some((c) => c.includes("PO-104")))).toBe(
      true,
    );

    const metric = metricSection(report);
    expect(JSON.stringify(metric.content)).toMatch(/₹/);
  });

  it("collections_priority ranks by amount × days overdue", async () => {
    // Add a second overdue invoice with lower risk score
    await store.upsertNode({
      _id: "node_inv_low",
      orgId: ORG,
      type: "Invoice",
      key: "Invoice:INV-LOW",
      label: "INV-LOW",
      props: {
        status: "overdue",
        amountInPaise: 10000,
        dueAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      },
    });

    const report = await generateReport(store, ORG, {
      template: "collections_priority",
    });
    assertValidReport(report);

    const table = tableSection(report, "priority");
    expect(table.rows.length).toBeGreaterThanOrEqual(2);

    const rankCol = table.columns.findIndex((c) =>
      c.toLowerCase().includes("rank"),
    );
    const invoiceCol = table.columns.findIndex((c) =>
      c.toLowerCase().includes("invoice"),
    );
    const riskCol = table.columns.findIndex((c) =>
      c.toLowerCase().includes("risk"),
    );

    expect(rankCol).toBeGreaterThanOrEqual(0);
    expect(invoiceCol).toBeGreaterThanOrEqual(0);
    expect(riskCol).toBeGreaterThanOrEqual(0);

    // First row should be INV-90 (higher amount × days)
    expect(table.rows[0]![invoiceCol]!).toContain("INV-90");
    expect(table.rows[0]![rankCol]!).toBe("1");

    const riskScores = table.rows.map((r) => Number(r[riskCol]));
    for (let i = 1; i < riskScores.length; i++) {
      expect(riskScores[i - 1]!).toBeGreaterThanOrEqual(riskScores[i]!);
    }
  });

  it("inventory_health flags low stock items", async () => {
    const report = await generateReport(store, ORG, {
      template: "inventory_health",
    });
    assertValidReport(report);

    const stockTable = tableSection(report, "stock");
    expect(
      stockTable.rows.some((r) => r.some((c) => c.includes("Diya-Large"))),
    ).toBe(true);

    // Diya-Large: on_hand 12, reserved 9 → available 3 = 25% — not under 20%
    // but seed has promise_risk on SO-218 / Diya. Either way, at-risk section exists.
    const markdown = report.sections.find((s) => s.kind === "markdown");
    expect(markdown).toBeDefined();

    // Force a clearly low-stock item
    await store.upsertNode({
      _id: "node_stock_low",
      orgId: ORG,
      type: "Stock",
      key: "Stock:LowItem@Workshop",
      label: "LowItem @ Workshop",
      props: { on_hand: 100, reserved: 95 },
    });

    const report2 = await generateReport(store, ORG, {
      template: "inventory_health",
    });
    const stock2 = tableSection(report2, "stock");
    const lowRow = stock2.rows.find((r) =>
      r.some((c) => c.includes("LowItem")),
    );
    expect(lowRow).toBeDefined();
    expect(lowRow!.join(" ").toLowerCase()).toMatch(/below|risk|20%/);

    const reorder = report2.sections.find(
      (s) =>
        s.kind === "markdown" &&
        s.heading.toLowerCase().includes("reorder"),
    );
    expect(String(reorder?.content)).toContain("LowItem");
  });

  it("formats amounts with Indian ₹ grouping", async () => {
    const report = await generateReport(store, ORG, {
      template: "collections_priority",
    });
    const blob = JSON.stringify(report);
    // INV-90 is 14,80,000 paise → ₹14,800
    expect(blob).toMatch(/₹14,800/);
  });
});
