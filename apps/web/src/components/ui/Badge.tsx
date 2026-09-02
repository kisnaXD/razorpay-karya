import type { ReactNode } from "react";

const tones = {
  risk: "bg-risk/10 text-risk",
  warn: "bg-warn/10 text-warn",
  success: "bg-teal/10 text-teal",
  muted: "bg-surface-2 text-muted",
  accent: "bg-signal/10 text-signal",
} as const;

export type BadgeTone = keyof typeof tones;

export type BadgeProps = {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone, children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
