import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconGraph(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M5.5 5.5 7 10M10.5 5.5 9 10M6 4h4" />
    </svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 4h12v8H2z" />
      <path d="M2 7h4l1 2h2l1-2h4" />
    </svg>
  );
}

export function IconOrders(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3h10v10H3z" />
      <path d="M5 6h6M5 8.5h4M5 11h5" />
    </svg>
  );
}

export function IconInventory(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 5 8 2l6 3v8l-6 3-6-3z" />
      <path d="M8 5v11M2 5l6 3 6-3" />
    </svg>
  );
}

export function IconMoney(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="4" width="12" height="8" rx="1" />
      <circle cx="8" cy="8" r="2" />
      <path d="M5 6.5h6M5 9.5h6" />
    </svg>
  );
}

export function IconPeople(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="11" cy="6" r="1.5" />
      <path d="M2 13c0-2 1.8-3 4-3s4 1 4 3M9.5 13c0-1.5 1-2.5 2.5-2.5" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="3" width="12" height="11" />
      <path d="M2 6h12M5 1.5V4M11 1.5V4" />
      <path d="M5 9h2M9 9h2M5 11.5h2" />
    </svg>
  );
}

export function IconListings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4h10M3 8h10M3 12h6" />
      <circle cx="12.5" cy="12" r="1" />
    </svg>
  );
}

export function IconPolicy(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 1.5 3 3.5v4c0 2.8 2.1 5.4 5 6 2.9-.6 5-3.2 5-6v-4L8 1.5z" />
      <path d="M6 8l1.5 1.5L10 6.5" />
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="2" width="5" height="5" rx="0.5" />
      <rect x="9" y="2" width="5" height="5" rx="0.5" />
      <rect x="2" y="9" width="5" height="5" rx="0.5" />
      <rect x="9" y="9" width="5" height="5" rx="0.5" />
    </svg>
  );
}

export function IconInvoice(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 2h8v12l-2-1.5L8 14l-2-1.5L4 14V2z" />
      <path d="M6 5h4M6 7.5h4M6 10h2" />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 9.5 9.5 6.5" />
      <path d="M7 11.5a2.5 2.5 0 0 1 0-3.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-.5.5" />
      <path d="M9 4.5a2.5 2.5 0 0 1 0 3.5l-1 1a2.5 2.5 0 1 1-3.5-3.5l.5-.5" />
    </svg>
  );
}

export function IconVendor(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 13V6l6-3 6 3v7" />
      <path d="M6 13V8h4v5" />
    </svg>
  );
}

export function IconBill(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <path d="M5.5 5h5M5.5 8h5M5.5 11h3" />
    </svg>
  );
}

export function IconStock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 12h12M4 12V7l4-3 4 3v5" />
      <path d="M6 12v-3h4v3" />
    </svg>
  );
}

export function IconMovement(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 8h10M9 5l3 3-3 3" />
      <path d="M14 5v6" />
    </svg>
  );
}

export function IconBom(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="3.5" r="1.5" />
      <circle cx="3.5" cy="12" r="1.5" />
      <circle cx="12.5" cy="12" r="1.5" />
      <path d="M8 5v3M8 8 4.5 11M8 8l3.5 3" />
    </svg>
  );
}

export function IconWorkOrder(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4h10v9H3z" />
      <path d="M6 2.5h4V4H6z" />
      <path d="M5.5 7.5h5M5.5 10h3" />
    </svg>
  );
}

export function IconAccounts(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 13h12" />
      <path d="M4 13V7h3v6M9 13V4h3v9" />
    </svg>
  );
}

export function IconAudit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3h7l3 3v7H3z" />
      <path d="M10 3v3h3M5.5 8.5h5M5.5 11h3.5" />
    </svg>
  );
}

export function IconOrg(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5.5" y="2" width="5" height="4" rx="0.5" />
      <rect x="2" y="10" width="4" height="4" rx="0.5" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" />
      <path d="M8 6v2M4 10V8h8v2" />
    </svg>
  );
}

export function IconReport(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 13V5l4 3 3-4 3 5v4z" />
      <path d="M3 13h10" />
    </svg>
  );
}

export function IconCompany(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2 14V5l5-2 5 2v9" />
      <path d="M7 14V8h4v6M4.5 7h2M4.5 9.5h2M4.5 12h2" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5a4 4 0 0 1 8 0c0 2.5 1 3.5 1 3.5H3s1-1 1-3.5" />
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="7" cy="7" r="4" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10l4-4 4 4" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 4 6 8l4 4" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
    </svg>
  );
}

export function IconMinimize(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8h8" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Legacy nav icons used by NavRail */
export const NAV_ICONS = [
  { id: "graph", label: "Graph", Icon: IconGraph, enabled: true, section: "Operations" },
  { id: "inbox", label: "Inbox", Icon: IconInbox, enabled: true, section: "Operations" },
  { id: "orders", label: "Orders", Icon: IconOrders, enabled: true, section: "Operations" },
  { id: "inventory", label: "Inventory", Icon: IconInventory, enabled: true, section: "Operations" },
  { id: "money", label: "Money", Icon: IconMoney, enabled: true, section: "Money" },
  { id: "people", label: "People", Icon: IconPeople, enabled: true, section: "Intelligence" },
  { id: "calendar", label: "Calendar", Icon: IconCalendar, enabled: true, section: "Intelligence" },
  { id: "listings", label: "Listings", Icon: IconListings, enabled: true, section: "Commerce" },
] as const;
