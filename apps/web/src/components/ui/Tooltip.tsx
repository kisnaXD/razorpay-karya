import type { ReactNode } from "react";

const positions = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
} as const;

export type TooltipPosition = keyof typeof positions;

export type TooltipProps = {
  label: string;
  children: ReactNode;
  position?: TooltipPosition;
};

export function Tooltip({
  label,
  children,
  position = "top",
}: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={[
          "pointer-events-none absolute z-50 whitespace-nowrap",
          "rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-white",
          "opacity-0 transition-opacity duration-[var(--duration-fast)] delay-0",
          "group-hover:opacity-100 group-hover:delay-150",
          "group-focus-within:opacity-100 group-focus-within:delay-150",
          positions[position],
        ].join(" ")}
      >
        {label}
      </span>
    </span>
  );
}
