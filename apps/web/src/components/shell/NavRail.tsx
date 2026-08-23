import { NAV_ICONS } from "./icons";

type NavRailProps = {
  exceptionCount: number;
};

export function NavRail({ exceptionCount }: NavRailProps) {
  return (
    <nav
      className="flex h-full flex-col items-center gap-1 py-3"
      aria-label="Primary"
    >
      {NAV_ICONS.map(({ id, label, Icon, enabled }) => {
        const active = id === "inbox";
        const disabled = !enabled;
        return (
          <button
            key={id}
            type="button"
            title={disabled ? "Step 2" : label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            aria-disabled={disabled || undefined}
            className={[
              "relative flex h-10 w-10 items-center justify-center border-0 bg-transparent",
              active ? "text-copper" : disabled ? "text-muted/50" : "text-muted",
            ].join(" ")}
            tabIndex={disabled ? -1 : 0}
          >
            <Icon />
            {id === "inbox" && exceptionCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center bg-risk px-1 font-mono text-[10px] leading-none text-text tabular-nums">
                {exceptionCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
