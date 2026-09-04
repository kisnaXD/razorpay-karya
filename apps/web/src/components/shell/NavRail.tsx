import type { ConsoleView } from "@/lib/api";
import { NAV_ICONS } from "./icons";

type NavRailProps = {
  activeView: ConsoleView;
  onNavigate: (view: ConsoleView) => void;
  exceptionCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
};

const NAV_VIEW_MAP: Record<string, ConsoleView | undefined> = {
  graph: "graph",
  inbox: "inbox",
  orders: "sales-orders",
  inventory: "items",
  money: "ledger",
  people: "contacts",
  calendar: "dashboard",
  listings: "dashboard",
};

const NAV_SECTIONS = ["Operations", "Money", "Intelligence", "Commerce"] as const;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

function IconMenu() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4.5h10M3 8h10M3 11.5h10"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NavRail({
  activeView,
  onNavigate,
  exceptionCount,
  expanded,
  onToggleExpand,
}: NavRailProps) {
  return (
    <nav
      className="flex h-full flex-col py-2"
      aria-label="Primary"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {NAV_SECTIONS.map((section, index) => {
          const items = NAV_ICONS.filter((item) => item.section === section);
          if (items.length === 0) return null;

          return (
            <div key={section} className="pb-1">
              {expanded ? (
                <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  {section}
                </div>
              ) : index > 0 ? (
                <div className="mx-2 my-1.5 h-px bg-line" />
              ) : null}
              {items.map(({ id, label, Icon }) => {
                const view = NAV_VIEW_MAP[id];
                const active = view === activeView;

                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      if (view) onNavigate(view);
                    }}
                    className={[
                      "group relative flex h-10 items-center gap-3 border-l-2 bg-transparent transition-colors duration-100",
                      FOCUS,
                      expanded ? "w-full px-3" : "w-full justify-center px-0",
                      active
                        ? "border-l-signal bg-signal/10 text-signal"
                        : "border-l-transparent text-muted hover:text-text",
                    ].join(" ")}
                  >
                    <span className="relative shrink-0">
                      <Icon />
                      {id === "inbox" && exceptionCount > 0 ? (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 animate-pulse items-center justify-center rounded-full bg-risk px-1 font-mono text-[11px] leading-none text-text tabular-nums">
                          {exceptionCount}
                        </span>
                      ) : null}
                    </span>
                    {expanded ? (
                      <span className="truncate text-[13px]">{label}</span>
                    ) : null}
                    {!expanded ? (
                      <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-text opacity-0 transition-all duration-200 group-hover:opacity-100">
                        {label}
                      </span>
                    ) : null}
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
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          aria-expanded={expanded}
          onClick={onToggleExpand}
          className={[
            "flex h-10 w-full items-center text-muted transition-colors duration-100 hover:text-text",
            FOCUS,
            expanded ? "justify-start gap-3 px-3" : "justify-center",
          ].join(" ")}
        >
          {expanded ? <IconClose /> : <IconMenu />}
          {expanded ? (
            <span className="text-[13px]">Collapse</span>
          ) : null}
        </button>
      </div>
    </nav>
  );
}
