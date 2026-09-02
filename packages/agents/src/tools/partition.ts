import type { CoreTool } from "ai";
import type { AgentId, ToolContext } from "../types.js";
import { toolNamesForAgent } from "../registry.js";
import { buildTools } from "./index.js";

export function buildToolsForAgent(
  ctx: ToolContext,
  agentId: AgentId,
): Record<string, CoreTool> {
  const all = buildTools(ctx);
  const names = new Set(toolNamesForAgent(agentId));
  return Object.fromEntries(
    Object.entries(all).filter(([name]) => names.has(name)),
  );
}
