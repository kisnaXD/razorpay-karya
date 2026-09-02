import type { ConsoleContextValue } from "@/lib/console-context";
import type { ConsoleView } from "@/lib/api";
import { runCollectionsLoop, simulateWebhook } from "@/lib/api";

export type Command = {
  id: string;
  label: string;
  keywords?: string;
  run: () => void;
};

export function buildCommands(ctx: ConsoleContextValue): Command[] {
  const nav = (view: ConsoleView, label: string): Command => ({
    id: `nav-${view}`,
    label,
    run: () => ctx.setView(view),
  });

  const nodeCommands =
    ctx.graph?.nodes.map((n) => ({
      id: `focus-${n.key}`,
      label: `Focus ${n.key}`,
      keywords: `${n.label} ${n.type}`,
      run: () => ctx.focusNode(n.key),
    })) ?? [];

  return [
    nav("dashboard", "Go to Dashboard"),
    nav("inbox", "Go to Inbox"),
    nav("graph", "Go to Graph"),
    nav("customers", "Go to Customers"),
    nav("sales-orders", "Go to Sales Orders"),
    nav("invoices", "Go to Invoices"),
    nav("payment-links", "Go to Payment Links"),
    nav("vendors", "Go to Vendors"),
    nav("purchase-orders", "Go to Purchase Orders"),
    nav("bills", "Go to Bills"),
    nav("items", "Go to Items"),
    nav("stock-levels", "Go to Stock Levels"),
    nav("stock-movements", "Go to Stock Movements"),
    nav("boms", "Go to BOMs"),
    nav("work-orders", "Go to Work Orders"),
    nav("accounts", "Go to Accounts"),
    nav("ledger", "Go to Ledger"),
    nav("audit-log", "Go to Audit Log"),
    nav("contacts", "Go to Contacts"),
    nav("organizations", "Go to Organizations"),
    nav("sales-reports", "Go to Sales Reports"),
    nav("inventory-reports", "Go to Inventory Reports"),
    nav("company-settings", "Go to Company Settings"),
    nav("policies", "Open Policy Studio"),
    nav("users", "Go to Users"),
    {
      id: "simulate-inv90-failure",
      label: "Simulate INV-90 payment failure",
      keywords: "expire payment link demo",
      run: () => {
        void (async () => {
          await simulateWebhook({
            event: "payment_link.expired",
            paymentKey: "Payment:plink_7",
          });
          await ctx.reload();
          ctx.setView("inbox");
        })();
      },
    },
    {
      id: "run-collections",
      label: "Run collections loop",
      keywords: "money tick nudge",
      run: () => {
        void (async () => {
          await runCollectionsLoop();
          await ctx.reload();
        })();
      },
    },
    ...nodeCommands,
  ];
}
