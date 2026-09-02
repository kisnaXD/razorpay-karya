import { z } from "zod";

export const policyRuleSchema = z.object({
  field: z.string(),
  op: z.enum(["eq", "neq", "lte", "gte", "in", "truthy"]),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
});

export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const compiledPolicySchema = z.object({
  action: z.string(),
  effect: z.enum(["allow", "deny", "require_approval"]),
  description: z.string(),
  rules: z.array(policyRuleSchema),
});

export type CompiledPolicy = z.infer<typeof compiledPolicySchema>;

export function parseCompiledPolicy(raw: string): CompiledPolicy {
  return compiledPolicySchema.parse(JSON.parse(raw));
}
