const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-teal",
  captured: "bg-teal",
  paid: "bg-teal",
  processed: "bg-teal",
  received: "bg-teal",
  delivered: "bg-teal",
  shipped: "bg-teal",
  packed: "bg-teal",
  ok: "bg-teal",
  pending: "bg-warn",
  sent: "bg-warn",
  queued: "bg-warn",
  late: "bg-warn",
  delayed: "bg-warn",
  promised: "bg-warn",
  open: "bg-warn",
  overdue: "bg-risk",
  failed: "bg-risk",
  expired: "bg-risk",
  cancelled: "bg-risk",
  low: "bg-risk",
  draft: "bg-muted",
};

const sizes = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
} as const;

export type StatusDotSize = keyof typeof sizes;

export type StatusDotProps = {
  status: string;
  size?: StatusDotSize;
};

export function StatusDot({ status, size = "md" }: StatusDotProps) {
  const color = STATUS_COLOR[status.toLowerCase()] ?? "bg-muted";

  return (
    <span
      role="status"
      aria-label={status}
      className={["inline-block rounded-full", sizes[size], color].join(" ")}
    />
  );
}
