"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/command/CommandPalette";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeIndex } from "@/components/graph/NodeIndex";
import { NodeInspector } from "@/components/graph/NodeInspector";
import { AgentInbox } from "@/components/inbox/ExceptionList";
import { PeopleView } from "@/components/people/PeopleView";
import { AppShell } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { GovernorDock } from "@/components/shell/GovernorDock";
import { PageHeader } from "@/components/ui";
import { ConsoleProvider, useConsole } from "@/lib/console-context";
import { AgentProvider, useAgent } from "@/lib/agent-context";
import {
  api,
  neighborhoodKeysFrom,
  neighborhoodPath,
  type ConsoleView,
  type InboxAction,
  type Neighborhood,
} from "@/lib/api";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { CustomersPage } from "@/components/pages/CustomersPage";
import { SalesOrdersPage } from "@/components/pages/SalesOrdersPage";
import { InvoicesPage } from "@/components/pages/InvoicesPage";
import { PaymentLinksPage } from "@/components/pages/PaymentLinksPage";
import { VendorsPage } from "@/components/pages/VendorsPage";
import { PurchaseOrdersPage } from "@/components/pages/PurchaseOrdersPage";
import { BillsPage } from "@/components/pages/BillsPage";
import { ItemsPage } from "@/components/pages/ItemsPage";
import { StockLevelsPage } from "@/components/pages/StockLevelsPage";
import { StockMovementsPage } from "@/components/pages/StockMovementsPage";
import { BomsPage } from "@/components/pages/BomsPage";
import { AccountsPage } from "@/components/pages/AccountsPage";
import { LedgerPage } from "@/components/pages/LedgerPage";
import { AuditLogPage } from "@/components/pages/AuditLogPage";
import { PoliciesPage } from "@/components/pages/PoliciesPage";
import { SalesReportsPage } from "@/components/pages/SalesReportsPage";
import { InventoryReportsPage } from "@/components/pages/InventoryReportsPage";
import { CompanySettingsPage } from "@/components/pages/CompanySettingsPage";
import { UsersPage } from "@/components/pages/UsersPage";
import { WorkOrdersPage } from "@/components/pages/WorkOrdersPage";

const CONSOLE_VIEWS = new Set<string>([
  "dashboard",
  "customers",
  "sales-orders",
  "invoices",
  "payment-links",
  "vendors",
  "purchase-orders",
  "bills",
  "items",
  "stock-levels",
  "stock-movements",
  "boms",
  "work-orders",
  "accounts",
  "ledger",
  "audit-log",
  "contacts",
  "organizations",
  "sales-reports",
  "inventory-reports",
  "company-settings",
  "policies",
  "users",
  "graph",
  "inbox",
]);

function isConsoleView(view: string): view is ConsoleView {
  return CONSOLE_VIEWS.has(view);
}

const VIEW_BREADCRUMB: Record<ConsoleView, string[]> = {
  dashboard: ["Home", "Dashboard"],
  customers: ["Sales", "Customers"],
  "sales-orders": ["Sales", "Sales Orders"],
  invoices: ["Sales", "Invoices"],
  "payment-links": ["Sales", "Payment Links"],
  vendors: ["Purchases", "Vendors"],
  "purchase-orders": ["Purchases", "Purchase Orders"],
  bills: ["Purchases", "Bills"],
  items: ["Inventory", "Items"],
  "stock-levels": ["Inventory", "Stock Levels"],
  "stock-movements": ["Inventory", "Movements"],
  boms: ["Manufacturing", "BOMs"],
  "work-orders": ["Manufacturing", "Work Orders"],
  accounts: ["Finance", "Accounts"],
  ledger: ["Finance", "Ledger"],
  "audit-log": ["Finance", "Audit Log"],
  contacts: ["CRM", "Contacts"],
  organizations: ["CRM", "Organizations"],
  "sales-reports": ["Reports", "Sales Reports"],
  "inventory-reports": ["Reports", "Inventory Reports"],
  "company-settings": ["Settings", "Company"],
  policies: ["Settings", "Policies"],
  users: ["Settings", "Users"],
  graph: ["Operations", "Graph"],
  inbox: ["Operations", "Inbox"],
};

function ComingSoon() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Coming Soon" subtitle="This module is being built" />
    </div>
  );
}

function InboxView() {
  const { graph, selectedNodeKey, focusNode } = useConsole();
  const { sendMessage, requestOpenDock } = useAgent();
  const [neighborhoodKeys, setNeighborhoodKeys] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    void api<Neighborhood>(neighborhoodPath("SalesOrder:SO-218", 2))
      .then((hood) => setNeighborhoodKeys(neighborhoodKeysFrom(hood)))
      .catch(() => setNeighborhoodKeys(new Set()));
  }, []);

  const onInboxAction = (action: InboxAction) => {
    if (action.kind === "agent_prompt" && action.payload.message) {
      requestOpenDock();
      void sendMessage(action.payload.message);
      return;
    }
    if (action.kind === "navigate" && action.payload.nodeKey) {
      focusNode(action.payload.nodeKey);
    }
  };

  if (!graph) return null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2">
      <AgentInbox
        onAction={onInboxAction}
        onNavigate={focusNode}
        selectedKey={selectedNodeKey}
      />
      <NodeIndex
        nodes={graph.nodes}
        neighborhoodKeys={neighborhoodKeys}
        selectedKey={selectedNodeKey}
        onSelect={focusNode}
      />
    </div>
  );
}

function GraphView() {
  const { graph, exceptions, selectedNodeKey, selectNode } = useConsole();

  if (!graph) return null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <GraphCanvas
        snapshot={graph}
        exceptions={exceptions}
        selectedNodeKey={selectedNodeKey}
        onNodeSelect={selectNode}
      />
      <NodeInspector
        nodeKey={selectedNodeKey}
        onClose={() => selectNode(null)}
      />
    </div>
  );
}

function CanvasBody({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const { view, loading, error } = useConsole();

  if (error) {
    return (
      <p className="px-4 py-3 text-muted">
        {error} — start the API on port 4000, then reload.
      </p>
    );
  }

  if (loading) {
    return <p className="px-4 py-3 text-muted">Loading…</p>;
  }

  switch (view) {
    case "dashboard":
      return <DashboardPage onNavigate={onNavigate} />;
    case "customers":
      return <CustomersPage onNavigate={onNavigate} />;
    case "sales-orders":
      return <SalesOrdersPage onNavigate={onNavigate} />;
    case "invoices":
      return <InvoicesPage onNavigate={onNavigate} />;
    case "payment-links":
      return <PaymentLinksPage onNavigate={onNavigate} />;
    case "vendors":
      return <VendorsPage onNavigate={onNavigate} />;
    case "purchase-orders":
      return <PurchaseOrdersPage onNavigate={onNavigate} />;
    case "bills":
      return <BillsPage onNavigate={onNavigate} />;
    case "items":
      return <ItemsPage onNavigate={onNavigate} />;
    case "stock-levels":
      return <StockLevelsPage onNavigate={onNavigate} />;
    case "stock-movements":
      return <StockMovementsPage onNavigate={onNavigate} />;
    case "accounts":
      return <AccountsPage onNavigate={onNavigate} />;
    case "ledger":
      return <LedgerPage onNavigate={onNavigate} />;
    case "audit-log":
      return <AuditLogPage onNavigate={onNavigate} />;
    case "policies":
      return <PoliciesPage onNavigate={onNavigate} />;
    case "sales-reports":
      return <SalesReportsPage onNavigate={onNavigate} />;
    case "inventory-reports":
      return <InventoryReportsPage onNavigate={onNavigate} />;
    case "company-settings":
      return <CompanySettingsPage onNavigate={onNavigate} />;
    case "contacts":
    case "organizations":
      return <PeopleView />;
    case "inbox":
      return (
        <div className="flex h-full min-h-0 flex-col">
          <PageHeader title="Inbox" subtitle="Exceptions needing attention" />
          <InboxView />
        </div>
      );
    case "graph":
      return (
        <div className="flex h-full min-h-0 flex-col">
          <PageHeader title="Graph" subtitle="Underlying operations graph" />
          <ReactFlowProvider>
            <GraphView />
          </ReactFlowProvider>
        </div>
      );
    case "work-orders":
      return <WorkOrdersPage onNavigate={onNavigate} />;
    case "users":
      return <UsersPage onNavigate={onNavigate} />;
    case "boms":
      return <BomsPage onNavigate={onNavigate} />;
    default:
      return <ComingSoon />;
  }
}

function ConsoleInner() {
  const { view, setView, bootstrap, focusNode, unacknowledgedCount } =
    useConsole();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const exceptionCount = bootstrap?.exceptionCount ?? 0;
  const notificationCount =
    unacknowledgedCount > 0 ? unacknowledgedCount : exceptionCount;
  const orgLabel = bootstrap?.org.label ?? null;
  const breadcrumb = VIEW_BREADCRUMB[view] ?? ["Home"];

  const onNavigate = (target: string) => {
    if (isConsoleView(target)) {
      setView(target);
      return;
    }
    // Alias quick-create / legacy targets into nearest views
    if (target === "new-invoice" || target === "approvals") {
      setView("invoices");
      return;
    }
    if (target === "new-po" || target === "purchase-orders/new") {
      setView("purchase-orders");
      return;
    }
    if (target === "new-item") {
      setView("items");
      return;
    }
    if (target.includes(":")) {
      focusNode(target);
    }
  };

  return (
    <>
      <AppShell
        sidebarExpanded={sidebarExpanded}
        sidebar={
          <Sidebar
            activeView={view}
            onNavigate={onNavigate}
            expanded={sidebarExpanded}
            onToggleExpand={() => setSidebarExpanded((open) => !open)}
            orgLabel={orgLabel}
          />
        }
        topbar={
          <TopBar
            breadcrumb={breadcrumb}
            onSearch={() => setCommandOpen(true)}
            notificationCount={notificationCount}
            onQuickCreate={() => setCommandOpen(true)}
            onNavigate={onNavigate}
          />
        }
        content={<CanvasBody onNavigate={onNavigate} />}
        dock={<GovernorDock />}
      />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}

export function Console() {
  return (
    <ConsoleProvider>
      <AgentProvider>
        <ConsoleInner />
      </AgentProvider>
    </ConsoleProvider>
  );
}
