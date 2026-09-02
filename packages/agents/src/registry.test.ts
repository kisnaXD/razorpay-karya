import { describe, expect, it } from "vitest";
import {
  AGENT_DEFINITIONS,
  SHARED_READ_TOOLS,
  getAgentDefinition,
  listConsultableAgents,
  toolNamesForAgent,
} from "./registry.js";
import { TOOL_SIDE_EFFECTS } from "./tools/index.js";
import type { AgentId } from "./types.js";

const SPECIALIST_IDS: AgentId[] = [
  "finance",
  "procurement",
  "sales",
  "operations",
];

describe("agent registry", () => {
  it("every partitioned tool name exists in TOOL_SIDE_EFFECTS", () => {
    for (const def of Object.values(AGENT_DEFINITIONS)) {
      for (const name of def.toolNames) {
        expect(
          TOOL_SIDE_EFFECTS[name],
          `${def.id} tool "${name}" missing from TOOL_SIDE_EFFECTS`,
        ).toBeDefined();
      }
    }
  });

  it("governor tool set covers all TOOL_SIDE_EFFECTS including consult_agents", () => {
    const governorTools = new Set(toolNamesForAgent("governor"));
    for (const name of Object.keys(TOOL_SIDE_EFFECTS)) {
      expect(governorTools.has(name)).toBe(true);
    }
    expect(governorTools.has("consult_agents")).toBe(true);
  });

  it("shared read tools are included for every specialist", () => {
    for (const id of SPECIALIST_IDS) {
      const names = new Set(toolNamesForAgent(id));
      for (const shared of SHARED_READ_TOOLS) {
        expect(names.has(shared)).toBe(true);
      }
    }
  });

  it("listConsultableAgents returns only specialists", () => {
    const list = listConsultableAgents();
    expect(list.every((a) => a.canConsult)).toBe(true);
    expect(list.map((a) => a.id).sort()).toEqual(
      [...SPECIALIST_IDS].sort(),
    );
    expect(list.find((a) => a.id === "governor")).toBeUndefined();
  });

  it("getAgentDefinition returns finance metadata", () => {
    const finance = getAgentDefinition("finance");
    expect(finance.displayName).toMatch(/finance/i);
    expect(finance.canConsult).toBe(true);
    expect(finance.canDirectChat).toBe(true);
  });
});
