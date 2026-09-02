"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import {
  IconAccounts,
  IconAudit,
  IconBill,
  IconBom,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCompany,
  IconDashboard,
  IconInventory,
  IconInvoice,
  IconLink,
  IconMenu,
  IconMoney,
  IconMovement,
  IconOrders,
  IconOrg,
  IconPeople,
  IconPolicy,
  IconReport,
  IconStock,
  IconUsers,
  IconVendor,
  IconWorkOrder,
} from "./icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type SidebarProps = {
  activeView: string;
  onNavigate: (view: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  orgLabel: string | null;
};

type NavItem = {
  id: string;
  label: string;
  Icon: IconComponent;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "Home",
    items: [{ id: "dashboard", label: "Dashboard", Icon: IconDashboard }],
  },
  {
    id: "sales",
    label: "Sales",
    items: [
      { id: "customers", label: "Customers", Icon: IconPeople },
      { id: "sales-orders", label: "Sales Orders", Icon: IconOrders },
      { id: "invoices", label: "Invoices", Icon: IconInvoice },
      { id: "payment-links", label: "Payment Links", Icon: IconLink },
    ],
  },
  {
    id: "purchases",
    label: "Purchases",
    items: [
      { id: "vendors", label: "Vendors", Icon: IconVendor },
      { id: "purchase-orders", label: "Purchase Orders", Icon: IconOrders },
      { id: "bills", label: "Bills", Icon: IconBill },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    items: [
      { id: "items", label: "Items", Icon: IconInventory },
      { id: "stock-levels", label: "Stock Levels", Icon: IconStock },
      { id: "stock-movements", label: "Movements", Icon: IconMovement },
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    items: [
      { id: "boms", label: "BOMs", Icon: IconBom },
      { id: "work-orders", label: "Work Orders", Icon: IconWorkOrder },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { id: "accounts", label: "Accounts", Icon: IconAccounts },
      { id: "ledger", label: "Ledger", Icon: IconMoney },
      { id: "audit-log", label: "Audit Log", Icon: IconAudit },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { id: "contacts", label: "Contacts", Icon: IconPeople },
      { id: "organizations", label: "Organizations", Icon: IconOrg },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { id: "sales-reports", label: "Sales Reports", Icon: IconReport },
      { id: "inventory-reports", label: "Inventory Reports", Icon: IconReport },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { id: "company-settings", label: "Company", Icon: IconCompany },
      { id: "policies", label: "Policies", Icon: IconPolicy },
      { id: "users", label: "Users", Icon: IconUsers },
    ],
  },
];

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

export function Sidebar({
  activeView,
  onNavigate,
  expanded,
  onToggleExpand,
  orgLabel,
}: SidebarProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(NAV_SECTIONS.map((s) => [s.id, true])),
  );

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <nav
      className="flex h-full flex-col overflow-x-hidden bg-surface"
      aria-label="Primary"
    >
      <div
        className={[
          "shrink-0 overflow-hidden border-b border-line transition-[padding] duration-200",
          expanded ? "px-4 py-4" : "flex flex-col items-center px-2 py-3",
        ].join(" ")}
      >
        <span className="font-display text-[22px] italic leading-none text-text">
          {expanded ? "Karya" : "K"}
        </span>
        {expanded ? (
          <span className="mt-1 block truncate text-[12px] text-muted">
            {orgLabel ?? "Arka Atelier"}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2">
        {NAV_SECTIONS.map((section, index) => {
          const isOpen = openSections[section.id] !== false;
          return (
            <div key={section.id} className="overflow-hidden pb-1">
              {expanded ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={[
                    "flex w-full items-center justify-between py-1.5 pr-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted",
                    FOCUS,
                  ].join(" ")}
                  style={{ paddingLeft: 16 }}
                  aria-expanded={isOpen}
                >
                  <span className="truncate">{section.label}</span>
                  {isOpen ? <IconChevronDown /> : <IconChevronRight />}
                </button>
              ) : index > 0 ? (
                <div className="mx-2 my-1.5 h-px bg-line" />
              ) : null}

              {(expanded ? isOpen : true) &&
                section.items.map(({ id, label, Icon }) => {
                  const active = id === activeView;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => onNavigate(id)}
                      className={[
                        "group relative flex h-9 items-center gap-3 overflow-hidden border-l-2 bg-transparent transition-colors duration-150",
                        FOCUS,
                        expanded ? "w-full px-3" : "w-full justify-center px-0",
                        active
                          ? "border-l-signal bg-signal/10 font-medium text-signal"
                          : "border-l-transparent text-muted hover:bg-surface-2/50 hover:text-text",
                      ].join(" ")}
                    >
                      <span className="shrink-0">
                        <Icon width={16} height={16} />
                      </span>
                      {expanded ? (
                        <span className="truncate text-[13px]">{label}</span>
                      ) : (
                        <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-text opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          {label}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-line py-2">
        <button
          type="button"
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          onClick={onToggleExpand}
          className={[
            "flex h-10 w-full items-center text-muted transition-colors duration-100 hover:text-text",
            FOCUS,
            expanded ? "justify-start gap-3 px-3" : "justify-center",
          ].join(" ")}
        >
          {expanded ? <IconChevronLeft /> : <IconMenu />}
          {expanded ? <span className="text-[13px]">Collapse</span> : null}
        </button>
      </div>
    </nav>
  );
}
