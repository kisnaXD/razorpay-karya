import { z } from "zod";
import type { ProposedAction } from "@karya/policy";
import { newNodeId } from "@karya/graph";
import { explanationField } from "./schemas.js";
import { searchVendors } from "../sourcing/search.js";
import {
  buildDraftPreview,
  explainMaterialNeed,
} from "../sourcing/draft-po.js";
import type { ToolContext } from "../types.js";

export const sourcingExplainNeedSchema = z.object({
  materialKey: z.string().min(1),
  triggerSalesOrderKey: z.string().optional(),
  explanation: explanationField,
});

export const sourcingSearchVendorsSchema = z.object({
  materialKey: z.string().min(1),
  maxResults: z.number().int().min(1).max(5).optional(),
  preferVerified: z.boolean().optional(),
  explanation: explanationField,
});

export const sourcingBrowsePublicSchema = z.object({
  url: z.string().url(),
  purpose: z.string().min(1),
  explanation: explanationField,
});

export const sourcingDraftPoSchema = z.object({
  vendorOrgKey: z.string().min(1),
  materialKey: z.string().min(1),
  qtyKg: z.number().positive(),
  reasonSalesOrderKeys: z.array(z.string()).optional(),
  expectedAtDays: z.number().int().positive().optional(),
  explanation: explanationField,
});

export async function sourcingExplainNeed(
  ctx: ToolContext,
  input: z.infer<typeof sourcingExplainNeedSchema>,
) {
  return explainMaterialNeed(ctx.store, ctx.orgId, {
    materialKey: input.materialKey,
    ...(input.triggerSalesOrderKey
      ? { triggerSalesOrderKey: input.triggerSalesOrderKey }
      : {}),
  });
}

export async function sourcingSearchVendorsTool(
  ctx: ToolContext,
  input: z.infer<typeof sourcingSearchVendorsSchema>,
) {
  void ctx;
  return searchVendors(input.materialKey, {
    maxResults: input.maxResults ?? 3,
    preferVerified: input.preferVerified ?? true,
  });
}

export async function sourcingBrowsePublic(
  ctx: ToolContext,
  input: z.infer<typeof sourcingBrowsePublicSchema>,
) {
  const fallback = searchVendors("Material:BrassSheet-22g", {
    maxResults: 3,
  });

  await ctx.writeAudit({
    eventType: "browse.failed",
    sideEffectClass: "external",
    payload: {
      url: input.url,
      purpose: input.purpose,
      explanation: input.explanation,
      reason: "browser_disabled",
      fallback: "directory",
      eventKey: `Event:browse.failed-${newNodeId()}`,
    },
  });

  return {
    ok: false as const,
    error: "browser_disabled",
    fallback: "directory" as const,
    vendors: fallback.vendors,
    fallbackVendors: fallback.vendors,
  };
}

export async function sourcingDraftPo(
  ctx: ToolContext,
  input: z.infer<typeof sourcingDraftPoSchema>,
) {
  const reservedPoKeys = ctx.listReservedPoKeys
    ? await ctx.listReservedPoKeys()
    : [];
  const preview = await buildDraftPreview(ctx.store, {
    orgId: ctx.orgId,
    vendorOrgKey: input.vendorOrgKey,
    materialKey: input.materialKey,
    qtyKg: input.qtyKg,
    ...(input.reasonSalesOrderKeys
      ? { reasonSalesOrderKeys: input.reasonSalesOrderKeys }
      : {}),
    ...(input.expectedAtDays !== undefined
      ? { expectedAtDays: input.expectedAtDays }
      : {}),
    explanation: input.explanation,
    reservedPoKeys,
  });

  const proposed: ProposedAction = {
    action: "po.create",
    orgId: ctx.orgId,
    targetNodeKey: input.vendorOrgKey,
    amountInPaise: preview.estimatedTotalInPaise,
    explanation: preview.why,
    proposedBy: "agent:sourcing",
    metadata: {
      materialKey: input.materialKey,
      qtyKg: input.qtyKg,
      poKey: preview.poKey,
      expectedAt: preview.expectedAt,
      reasonSalesOrderKeys: input.reasonSalesOrderKeys
        ? JSON.stringify(input.reasonSalesOrderKeys)
        : null,
      vendorLabel: preview.vendorLabel,
      materialLabel: preview.materialLabel,
      why: preview.why,
    },
  };

  const evaluation = await ctx.evaluateAction(proposed);
  await ctx.writeAudit({
    eventType: "policy.evaluated",
    sideEffectClass: "read",
    payload: { proposed, evaluation },
  });

  if (evaluation.finalDecision === "deny") {
    return { status: "denied" as const, draftPreview: preview, evaluation };
  }

  if (evaluation.finalDecision === "require_approval") {
    const created = await ctx.createApproval(proposed);
    if ("autoAllowed" in created) {
      return {
        status: "awaiting_approval" as const,
        draftPreview: preview,
        evaluation,
      };
    }
    return {
      status: "awaiting_approval" as const,
      approvalId: created.approval._id,
      draftPreview: preview,
    };
  }

  return {
    status: "awaiting_approval" as const,
    draftPreview: preview,
    evaluation,
  };
}
