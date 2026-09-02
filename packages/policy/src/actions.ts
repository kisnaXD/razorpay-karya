export const POLICY_ACTIONS = [
  "pay.vendor",
  "collect.invoice",
  "money.recovery",
  "po.create",
  "discount",
  "listing.publish",
  "email.send",
  "browser.write",
  "browser.get",
] as const;

export type PolicyAction = (typeof POLICY_ACTIONS)[number];
