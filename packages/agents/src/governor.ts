import { streamText, tool, type CoreMessage, type CoreTool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildSystemPrompt } from "./system-prompt.js";
import { consultAgentsSchema } from "./tools/schemas.js";
import { newEntryId, wrapToolsForTracing } from "./tracing.js";
import type {
  AgentThread,
  ConsultFinding,
  ThreadEntry,
} from "./types.js";

export type GovernorDeps = {
  model: string;
  apiKey: string;
  orgId: string;
  orgLabel: string;
  actor: string;
  contextNodeKey: string | null;
  exceptionCount: number;
  memories?: string[];
  briefingSummary?: string;
  threadEntries: ThreadEntry[];
  tools: Record<string, CoreTool>;
  onToolStart: (entry: ThreadEntry) => Promise<void>;
  onToolFinish: (
    entryId: string,
    update: Partial<Extract<ThreadEntry, { kind: "tool" }>>,
  ) => Promise<void>;
  onTextDelta?: (delta: string) => void;
  onUserEntry?: (entry: ThreadEntry) => Promise<void>;
  /** When provided, registers the consult_agents meta-tool. */
  consultAgents?: (
    requests: Array<{ agentId: ConsultFinding["agentId"]; question: string }>,
  ) => Promise<ConsultFinding[]>;
};

export type GovernorTurnResult = {
  assistantText: string;
  newEntries: ThreadEntry[];
  pendingApproval: AgentThread["pending"];
};

function toCoreMessages(entries: ThreadEntry[]): CoreMessage[] {
  const messages: CoreMessage[] = [];
  for (const entry of entries) {
    if (entry.kind === "user") {
      messages.push({ role: "user", content: entry.content });
    } else if (entry.kind === "assistant" && entry.content.trim().length > 0) {
      messages.push({ role: "assistant", content: entry.content });
    }
  }
  return messages;
}

export async function runGovernorTurn(
  deps: GovernorDeps,
  userMessage: string,
): Promise<GovernorTurnResult> {
  const newEntries: ThreadEntry[] = [];
  const now = () => new Date().toISOString();

  const userEntry: ThreadEntry = {
    id: newEntryId(),
    kind: "user",
    content: userMessage,
    contextNodeKey: deps.contextNodeKey,
    createdAt: now(),
  };
  newEntries.push(userEntry);
  await deps.onUserEntry?.(userEntry);

  const state = {
    newEntries,
    pendingApproval: null as AgentThread["pending"],
    onToolStart: deps.onToolStart,
    onToolFinish: deps.onToolFinish,
  };

  const openai = createOpenAI({ apiKey: deps.apiKey });
  const system = buildSystemPrompt({
    orgLabel: deps.orgLabel,
    contextNodeKey: deps.contextNodeKey,
    exceptionCount: deps.exceptionCount,
    ...(deps.memories !== undefined ? { memories: deps.memories } : {}),
    ...(deps.briefingSummary !== undefined
      ? { briefingSummary: deps.briefingSummary }
      : {}),
  });

  const messages: CoreMessage[] = [
    ...toCoreMessages(deps.threadEntries),
    { role: "user", content: userMessage },
  ];

  const toolsWithConsult: Record<string, CoreTool> = { ...deps.tools };
  if (deps.consultAgents) {
    toolsWithConsult.consult_agents = tool({
      description:
        "Consult specialist agents in parallel for cross-domain analysis. Use for questions about margins/discounts, cash+inventory, delays, or any question spanning Finance, Procurement, Sales, or Operations.",
      parameters: consultAgentsSchema,
      execute: async (input) => {
        const findings = await deps.consultAgents!(input.requests);
        return { findings };
      },
    });
  }

  const tracedTools = wrapToolsForTracing(toolsWithConsult, state);

  const result = streamText({
    model: openai(deps.model),
    system,
    messages,
    tools: tracedTools,
    maxSteps: 12,
  });

  let assistantText = "";
  for await (const delta of result.textStream) {
    assistantText += delta;
    deps.onTextDelta?.(delta);
  }

  if (!assistantText.trim()) {
    assistantText = (await result.text) || "";
  }

  const assistantEntry: ThreadEntry = {
    id: newEntryId(),
    kind: "assistant",
    content: assistantText,
    createdAt: now(),
    agentId: "governor",
  };
  newEntries.push(assistantEntry);

  return {
    assistantText,
    newEntries,
    pendingApproval: state.pendingApproval,
  };
}

export type GovernorResumeInput = {
  approvalStatus: "approved" | "rejected";
  pending: NonNullable<AgentThread["pending"]>;
  executeMoney: (input: {
    invoiceKey: string;
    explanation: string;
  }) => Promise<unknown>;
};

export async function runGovernorResume(
  input: GovernorResumeInput,
): Promise<{
  toolUpdate: Partial<Extract<ThreadEntry, { kind: "tool" }>>;
  assistantMessage: string;
}> {
  const now = new Date().toISOString();

  if (input.approvalStatus === "rejected") {
    return {
      toolUpdate: {
        status: "error",
        error: "Operator rejected the approval.",
        output: { status: "rejected" },
        completedAt: now,
      },
      assistantMessage:
        "Payment link not sent — you rejected the approval.",
    };
  }

  const payload = input.pending.resumePayload;
  const invoiceKey = String(payload.invoiceKey ?? "");
  const explanation =
    typeof payload.explanation === "string"
      ? payload.explanation
      : "Approved payment link";

  const output = await input.executeMoney({ invoiceKey, explanation });
  return {
    toolUpdate: {
      status: "done",
      output,
      error: null,
      completedAt: now,
    },
    assistantMessage: `Payment link created for ${invoiceKey}.`,
  };
}
