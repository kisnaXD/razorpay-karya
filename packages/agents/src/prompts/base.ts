export type PromptContext = {
  orgLabel: string;
  contextNodeKey: string | null;
  exceptionCount: number;
  memories?: string[];
  briefingSummary?: string;
};

export function buildAgentContextBlock(ctx: PromptContext): string {
  const contextLine = ctx.contextNodeKey
    ? `Operator has selected ${ctx.contextNodeKey} — prefer it in graph tools when relevant.`
    : "No node is selected in the console.";

  const lines: string[] = [
    `Organization: ${ctx.orgLabel}`,
    contextLine,
  ];

  if (ctx.exceptionCount > 0) {
    lines.push(
      `There are ${ctx.exceptionCount} open exceptions — prioritize by severity when relevant.`,
    );
  } else {
    lines.push("No open exceptions right now.");
  }

  const memories = ctx.memories?.filter((m) => m.trim().length > 0) ?? [];
  if (memories.length > 0) {
    lines.push(
      "",
      "## Organizational Memory",
      "These are things remembered about how this organization operates:",
      ...memories.map((m) => `- ${m}`),
      "",
      'Use these when making recommendations. Cite them naturally: "Based on past experience, we chose Supplier A because..."',
    );
  }

  if (ctx.briefingSummary && ctx.briefingSummary.trim().length > 0) {
    lines.push("", "## Morning briefing", ctx.briefingSummary.trim());
  }

  return lines.join("\n");
}

export function reasoningProtocolBlock(): string {
  return [
    "## Reasoning Protocol (MANDATORY for every response)",
    "Structure every substantive answer with these four beats:",
    "1. **Observation** — What you found via tools. Always cite node keys and concrete data (qty, ₹ amounts, dates, status).",
    "2. **Why it matters** — Business impact in one sentence (cash, margin, delivery promise, or customer trust).",
    "3. **Recommendation** — Specific action naming node keys (e.g. chase PurchaseOrder:PO-104, collect Invoice:INV-90).",
    "4. **What I'll do** — Which tool you will call next, or what needs operator approval before you proceed.",
  ].join("\n");
}

export function sharedRulesBlock(): string {
  return [
    "## Rules",
    "- Never list more than 5 items without grouping or summarizing by domain/severity.",
    '- Never say "I don\'t have access" — call `query_graph` or `list_all_data` first.',
    "- Always back recommendations with data from tools.",
    "- Format amounts in ₹ with Indian grouping (e.g. ₹14,800).",
    "- Cite node keys (e.g. SKU:Diya-Large, SalesOrder:SO-218) in every answer that touches the graph.",
    "- Every tool call needs a clear explanation (≥8 chars).",
    "- Operational truth is the graph. Prefer tools over guessing.",
    "- No markdown headers in operator-facing replies unless listing numbered choices.",
    "- Speak like a sharp ops lead: short sentences, numbered choices when offering options.",
  ].join("\n");
}
