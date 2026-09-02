import type { Db } from "mongodb";
import type { GraphStore } from "@karya/graph";
import { newNodeId } from "@karya/graph";
import {
  explainMaterialNeed,
  searchVendors,
  type ExplainNeedResult,
} from "@karya/agents";
import { writeAuditEvent } from "./audit.js";

export async function listSourcingVendors(
  materialKey: string,
  limit?: number,
) {
  return searchVendors(materialKey, {
    maxResults: limit ?? 3,
    preferVerified: true,
  });
}

export async function explainSourcingNeed(
  store: GraphStore,
  orgId: string,
  materialKey: string,
  soKey?: string,
): Promise<ExplainNeedResult> {
  return explainMaterialNeed(store, orgId, {
    materialKey,
    ...(soKey ? { triggerSalesOrderKey: soKey } : {}),
  });
}

export type BrowseEnqueueResult =
  | { ok: false; statusCode: 503; error: "browser_disabled"; fallbackVendors: ReturnType<typeof searchVendors> }
  | { ok: true; jobId: string };

/**
 * Browser is Task 5 (worker). When disabled, return 503 + directory fallback.
 */
export async function enqueueBrowse(
  store: GraphStore,
  orgId: string,
  input: {
    url: string;
    purpose: string;
    explanation: string;
    materialKey?: string;
    browserEnabled: boolean;
  },
): Promise<BrowseEnqueueResult> {
  const materialKey = input.materialKey ?? "Material:BrassSheet-22g";
  const fallback = searchVendors(materialKey, { maxResults: 3 });

  if (!input.browserEnabled) {
    await writeAuditEvent(store, {
      orgId,
      eventType: "browse.failed",
      actor: "agent:sourcing",
      sideEffectClass: "external",
      payload: {
        url: input.url,
        purpose: input.purpose,
        explanation: input.explanation,
        reason: "browser_disabled",
        fallback: "directory",
      },
    });
    return {
      ok: false,
      statusCode: 503,
      error: "browser_disabled",
      fallbackVendors: fallback,
    };
  }

  // Placeholder job id for when worker is enabled (Task 5).
  const jobId = `job_${newNodeId()}`;
  return { ok: true, jobId };
}

export async function getBrowseJob(
  _db: Db,
  _orgId: string,
  _jobId: string,
): Promise<{ status: "pending" | "running" | "done" | "failed"; error?: string }> {
  return { status: "failed", error: "browser_disabled" };
}
