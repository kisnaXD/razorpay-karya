import type { NodeRecord } from "@karya/graph";

export type FailureClass = "expired" | "failed" | "cancelled";

export function classifyPaymentFailure(
  payment: NodeRecord,
  webhookEvent: string,
): FailureClass {
  if (webhookEvent === "payment_link.expired") {
    return "expired";
  }
  if (webhookEvent === "payment.failed") {
    return "failed";
  }
  const status =
    typeof payment.props.status === "string" ? payment.props.status : "";
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "expired") {
    return "expired";
  }
  if (status === "failed") {
    return "failed";
  }
  return "failed";
}
