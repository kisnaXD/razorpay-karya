import type { AgentId } from "../types.js";
import type { PromptContext } from "./base.js";
import { buildFinancePrompt } from "./finance.js";
import { buildGovernorPrompt } from "./governor.js";
import { buildOperationsPrompt } from "./operations.js";
import { buildProcurementPrompt } from "./procurement.js";
import { buildSalesPrompt } from "./sales.js";

export type { PromptContext } from "./base.js";
export { buildGovernorPrompt } from "./governor.js";
export { buildFinancePrompt } from "./finance.js";
export { buildProcurementPrompt } from "./procurement.js";
export { buildSalesPrompt } from "./sales.js";
export { buildOperationsPrompt } from "./operations.js";

export function buildPromptForAgent(
  agentId: AgentId,
  ctx: PromptContext,
): string {
  switch (agentId) {
    case "governor":
      return buildGovernorPrompt(ctx);
    case "finance":
      return buildFinancePrompt(ctx);
    case "procurement":
      return buildProcurementPrompt(ctx);
    case "sales":
      return buildSalesPrompt(ctx);
    case "operations":
      return buildOperationsPrompt(ctx);
  }
}
