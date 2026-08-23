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

export const NAV_ICONS = [
  { id: "graph", label: "Graph", Icon: IconGraph, enabled: true },
  { id: "inbox", label: "Inbox", Icon: IconInbox, enabled: true },
  { id: "orders", label: "Orders", Icon: IconOrders, enabled: false },
  { id: "inventory", label: "Inventory", Icon: IconInventory, enabled: false },
  { id: "money", label: "Money", Icon: IconMoney, enabled: false },
  { id: "people", label: "People", Icon: IconPeople, enabled: false },
  { id: "calendar", label: "Calendar", Icon: IconCalendar, enabled: false },
  { id: "listings", label: "Listings", Icon: IconListings, enabled: false },
] as const;
