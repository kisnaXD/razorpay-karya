import type { CoreTool } from "ai";
import { ulid } from "ulid";
import { TOOL_SIDE_EFFECTS } from "./tools/index.js";
import type {
  AgentId,
  AgentThread,
  SideEffectClass,
  ThreadEntry,
} from "./types.js";

export function newEntryId(): string {
  return `entry_${ulid()}`;
}

export type TracingCallbacks = {
  newEntries: ThreadEntry[];
  pendingApproval: AgentThread["pending"];
  onToolStart: (entry: ThreadEntry) => Promise<void>;
  onToolFinish: (
    entryId: string,
    update: Partial<Extract<ThreadEntry, { kind: "tool" }>>,
  ) => Promise<void>;
  agentId?: AgentId;
  consultEntryId?: string;
};

export function wrapToolsForTracing(
  tools: Record<string, CoreTool>,
  state: TracingCallbacks,
): Record<string, CoreTool> {
  const wrapped: Record<string, CoreTool> = {};

  for (const [name, coreTool] of Object.entries(tools)) {
    const originalExecute = coreTool.execute;
    if (!originalExecute) {
      wrapped[name] = coreTool;
      continue;
    }

    wrapped[name] = {
      ...coreTool,
      execute: async (args: unknown, options: unknown) => {
        const input = (args ?? {}) as Record<string, unknown>;
        const explanation =
          typeof input.explanation === "string"
            ? input.explanation
            : "Agent tool call";
        const sideEffectClass: SideEffectClass =
          TOOL_SIDE_EFFECTS[name] ?? "read";
        const entryId = newEntryId();
        const createdAt = new Date().toISOString();

        const entry: ThreadEntry = {
          id: entryId,
          kind: "tool",
          toolName: name,
          sideEffectClass,
          status: "running",
          explanation,
          input,
          output: null,
          error: null,
          approvalId: null,
          createdAt,
          completedAt: null,
          ...(state.agentId !== undefined ? { agentId: state.agentId } : {}),
          ...(state.consultEntryId !== undefined
            ? { consultEntryId: state.consultEntryId }
            : {}),
        };
        state.newEntries.push(entry);
        await state.onToolStart(entry);

        try {
          const output = await originalExecute(args, options as never);
          let status: Extract<ThreadEntry, { kind: "tool" }>["status"] =
            "done";
          let approvalId: string | null = null;

          if (
            output &&
            typeof output === "object" &&
            "status" in (output as object) &&
            (output as { status: string }).status === "awaiting_approval"
          ) {
            status = "awaiting_approval";
            approvalId =
              typeof (output as { approvalId?: unknown }).approvalId ===
              "string"
                ? (output as { approvalId: string }).approvalId
                : null;
            if (approvalId) {
              state.pendingApproval = {
                approvalId,
                toolEntryId: entryId,
                resumePayload: input,
              };
            }
          }

          const completedAt = new Date().toISOString();
          entry.status = status;
          entry.output = output;
          entry.approvalId = approvalId;
          entry.completedAt = completedAt;
          await state.onToolFinish(entryId, {
            status,
            output,
            error: null,
            approvalId,
            completedAt,
          });
          return output;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const completedAt = new Date().toISOString();
          const errorResult = {
            error: err instanceof Error ? err.message : "Tool execution failed",
          };
          entry.status = "error";
          entry.error = message;
          entry.output = errorResult;
          entry.completedAt = completedAt;
          await state.onToolFinish(entryId, {
            status: "error",
            error: message,
            output: errorResult,
            completedAt,
          });
          return errorResult;
        }
      },
    } as CoreTool;
  }

  return wrapped;
}
