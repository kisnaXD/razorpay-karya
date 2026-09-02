export function idempotencyKey(
  orgId: string,
  action: string,
  ref: string,
): string {
  const safe = ref.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return `karya_${orgId}_${action}_${safe}`;
}
