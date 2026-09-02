"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useConsole } from "@/lib/console-context";
import { IconBell, IconPlus, IconSearch } from "./icons";

export type TopBarProps = {
  breadcrumb: string[];
  onSearch: () => void;
  notificationCount: number;
  onQuickCreate: () => void;
  onNavigate?: (view: string) => void;
};

type Severity = "risk" | "warn" | "info";

const SEVERITY_DOT: Record<Severity, string> = {
  risk: "bg-risk",
  warn: "bg-warn",
  info: "bg-signal",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

const DROPDOWN =
  "absolute right-0 top-full z-50 mt-1.5 max-w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-lg";

function eventSeverity(
  type: "exception.new" | "exception.resolved",
): Severity {
  if (type === "exception.resolved") return "info";
  return "warn";
}

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function TopBar({
  breadcrumb,
  onSearch,
  notificationCount,
  onQuickCreate,
  onNavigate,
}: TopBarProps) {
  const { agentEvents, unacknowledgedCount, acknowledgeAgentEvents } =
    useConsole();
  const [isDark, setIsDark] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [panelEvents, setPanelEvents] = useState(agentEvents);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifMenuId = useId();
  const profileMenuId = useId();

  const unreadCount =
    unacknowledgedCount > 0 ? unacknowledgedCount : notificationCount;

  useEffect(() => {
    const saved = localStorage.getItem("karya-theme");
    if (saved === "light") {
      document.documentElement.classList.add("light");
      setIsDark(false);
    }
  }, []);

  useEffect(() => {
    if (!notifOpen && !profileOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (notifOpen && notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (
        profileOpen &&
        profileRef.current &&
        !profileRef.current.contains(target)
      ) {
        setProfileOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [notifOpen, profileOpen]);

  function toggleTheme() {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("karya-theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("karya-theme", "light");
    }
  }

  async function openNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    setProfileOpen(false);
    if (next) {
      setPanelEvents(agentEvents);
      if (unacknowledgedCount > 0) {
        await acknowledgeAgentEvents();
      }
    }
  }

  function goTo(view: string) {
    setProfileOpen(false);
    onNavigate?.(view);
  }

  return (
    <header className="flex h-12 items-center gap-4 border-b border-line bg-surface px-4">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 shrink-0 items-center gap-1.5 text-[13px]"
      >
        {breadcrumb.map((crumb, i) => {
          const last = i === breadcrumb.length - 1;
          return (
            <span key={`${crumb}-${i}`} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-muted">›</span> : null}
              <span className={last ? "truncate text-text" : "truncate text-muted"}>
                {crumb}
              </span>
            </span>
          );
        })}
      </nav>

      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={onSearch}
          className={[
            "flex h-8 w-full max-w-[320px] items-center gap-2 border border-line bg-surface-2 px-3 text-left text-[13px] text-muted",
            "rounded-[var(--radius-md)]",
            FOCUS,
          ].join(" ")}
          aria-label="Search anything"
        >
          <IconSearch width={16} height={16} />
          <span className="flex-1 truncate">Search anything... (⌘K)</span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onQuickCreate}
          aria-label="Quick create"
          className={[
            "flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-muted transition-colors hover:bg-surface-2 hover:text-text",
            FOCUS,
          ].join(" ")}
        >
          <IconPlus width={16} height={16} />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
          className={[
            "flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-muted transition-colors hover:bg-surface-2 hover:text-text",
            FOCUS,
          ].join(" ")}
        >
          {isDark ? <IconMoon /> : <IconSun />}
        </button>

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            aria-label={
              unreadCount > 0
                ? `${unreadCount} notifications`
                : "Notifications"
            }
            aria-expanded={notifOpen}
            aria-controls={notifMenuId}
            onClick={() => {
              void openNotifications();
            }}
            className={[
              "relative flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-muted transition-colors hover:bg-surface-2 hover:text-text",
              FOCUS,
            ].join(" ")}
          >
            <IconBell width={16} height={16} />
            {unreadCount > 0 ? (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-risk"
                aria-hidden
              />
            ) : null}
          </button>

          {notifOpen ? (
            <div
              id={notifMenuId}
              role="menu"
              className={[DROPDOWN, "w-[320px]"].join(" ")}
            >
              <div className="border-b border-line px-3 py-2">
                <p className="text-[12px] font-medium text-text">Notifications</p>
                <p className="text-[11px] text-muted">
                  {panelEvents.length === 0
                    ? "You're all caught up"
                    : `${panelEvents.length} recent`}
                </p>
              </div>
              {panelEvents.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-muted">
                  No notifications
                </p>
              ) : (
                <ul className="max-h-80 overflow-y-auto py-1">
                  {panelEvents.map((item) => (
                    <li key={item._id}>
                      <div
                        role="menuitem"
                        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
                      >
                        <span
                          className={[
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            SEVERITY_DOT[eventSeverity(item.type)],
                          ].join(" ")}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] leading-snug text-text">
                            {item.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {formatEventTime(item.createdAt)}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="relative ml-1" ref={profileRef}>
          <button
            type="button"
            aria-label="User menu"
            aria-expanded={profileOpen}
            aria-controls={profileMenuId}
            title="Anika"
            onClick={() => {
              setProfileOpen((open) => !open);
              setNotifOpen(false);
            }}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[12px] font-medium text-text transition-colors hover:ring-2 hover:ring-line",
              FOCUS,
            ].join(" ")}
          >
            AA
          </button>

          {profileOpen ? (
            <div
              id={profileMenuId}
              role="menu"
              className={[DROPDOWN, "w-56"].join(" ")}
            >
              <div className="border-b border-line px-3 py-2.5">
                <p className="text-[13px] font-medium text-text">Anika</p>
                <p className="truncate text-[11px] text-muted">
                  anika@arka.atelier
                </p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => goTo("company-settings")}
                  className={[
                    "flex w-full px-3 py-2 text-left text-[12px] text-text transition-colors hover:bg-surface-2",
                    FOCUS,
                  ].join(" ")}
                >
                  Company Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => goTo("users")}
                  className={[
                    "flex w-full px-3 py-2 text-left text-[12px] text-text transition-colors hover:bg-surface-2",
                    FOCUS,
                  ].join(" ")}
                >
                  Users & Roles
                </button>
              </div>
              <div className="border-t border-line py-1">
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  title="Demo mode"
                  className="flex w-full cursor-not-allowed px-3 py-2 text-left text-[12px] text-muted opacity-60"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
