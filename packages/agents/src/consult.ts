import { generateText, type CoreTool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildPromptForAgent } from "./prompts/index.js";
import { buildToolsForAgent } from "./tools/partition.js";
import { newEntryId, wrapToolsForTracing } from "./tracing.js";
import type {
  AgentId,
  AgentThread,
  ConsultFinding,
  ThreadEntry,
  ToolContext,
} from "./types.js";

export type ConsultDeps = {
  model: string;
  apiKey: string;
  orgId: string;
  orgLabel: string;
  contextNodeKey: string | null;
  exceptionCount: number;
  memories?: string[];
  briefingSummary?: string;
  toolContext: ToolContext;
  onConsultStart?: (entry: ThreadEntry) => Promise<void>;
  onConsultFinish?: (
    entryId: string,
    update: Partial<Extract<ThreadEntry, { kind: "consult" }>>,
  ) => Promise<void>;
  onToolStart?: (entry: ThreadEntry) => Promise<void>;
  onToolFinish?: (
    entryId: string,
    update: Partial<Extract<ThreadEntry, { kind: "tool" }>>,
  ) => Promise<void>;
};

const SPECIALIST_IDS: AgentId[] = [
  "finance",
  "procurement",
  "sales",
  "operations",
];

function isSpecialistId(id: AgentId): boolean {
  return SPECIALIST_IDS.includes(id);
}

export async function consultAgent(
  agentId: AgentId,
  question: string,
  deps: ConsultDeps,
): Promise<ConsultFinding> {
  if (!isSpecialistId(agentId)) {
    return {
      agentId,
      question,
      findings: "",
      status: "error",
      error: `Cannot consult agent "${agentId}"`,
    };
  }

  const consultEntryId = newEntryId();
  const createdAt = new Date().toISOString();
  const consultEntry: ThreadEntry = {
    id: consultEntryId,
    kind: "consult",
    agentId,
    question,
    findings: null,
    status: "running",
    error: null,
    createdAt,
    completedAt: null,
  };
  await deps.onConsultStart?.(consultEntry);

  const newEntries: ThreadEntry[] = [];
  const state = {
    newEntries,
    pendingApproval: null as AgentThread["pending"],
    onToolStart: deps.onToolStart ?? (async () => {}),
    onToolFinish: deps.onToolFinish ?? (async () => {}),
    agentId,
    consultEntryId,
  };

  try {
    const system = buildPromptForAgent(agentId, {
      orgLabel: deps.orgLabel,
      contextNodeKey: deps.contextNodeKey,
      exceptionCount: deps.exceptionCount,
      ...(deps.memories !== undefined ? { memories: deps.memories } : {}),
      ...(deps.briefingSummary !== undefined
        ? { briefingSummary: deps.briefingSummary }
        : {}),
    });

    const tools: Record<string, CoreTool> = buildToolsForAgent(
      deps.toolContext,
      agentId,
    );
    const tracedTools = wrapToolsForTracing(tools, state);

    const openai = createOpenAI({ apiKey: deps.apiKey });
    const result = await generateText({
      model: openai(deps.model),
      system,
      messages: [{ role: "user", content: question }],
      tools: tracedTools,
      maxSteps: 8,
    });

    const findings = result.text?.trim() || "No findings returned.";
    const completedAt = new Date().toISOString();
    await deps.onConsultFinish?.(consultEntryId, {
      findings,
      status: "done",
      error: null,
      completedAt,
    });

    return {
      agentId,
      question,
      findings,
      status: "done",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const completedAt = new Date().toISOString();
    await deps.onConsultFinish?.(consultEntryId, {
      findings: null,
      status: "error",
      error: message,
      completedAt,
    });
    return {
      agentId,
      question,
      findings: "",
      status: "error",
      error: message,
    };
  }
}

export async function consultAgentsParallel(
  requests: Array<{ agentId: AgentId; question: string }>,
  deps: ConsultDeps,
): Promise<ConsultFinding[]> {
  const limited = requests.slice(0, 4);
  return Promise.all(
    limited.map((req) => consultAgent(req.agentId, req.question, deps)),
  );
}
