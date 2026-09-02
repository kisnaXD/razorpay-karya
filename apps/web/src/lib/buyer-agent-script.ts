import { a2aGet, a2aPost } from "./a2a-client";
import type { BuyerAgentMessage } from "@/components/buyer/BuyerAgentChat";
import type { HttpLogEntry } from "@/components/buyer/HttpRequestLog";

export const DEMO_BUYER_QUERY =
  "Find a large brass diya under ₹2,000 that can ship this week.";

export type BuyerDemoCallbacks = {
  onMessage: (message: BuyerAgentMessage) => void;
  onLog: (entry: HttpLogEntry) => void;
};

function endOfThisWeekIso(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilSunday = (7 - day) % 7;
  const end = new Date(now);
  end.setUTCDate(now.getUTCDate() + daysUntilSunday);
  end.setUTCHours(23, 59, 59, 999);
  return end.toISOString();
}

function msg(
  role: BuyerAgentMessage["role"],
  text: string,
): BuyerAgentMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    at: new Date().toISOString(),
  };
}

function logEntry(
  method: string,
  url: string,
  status: number,
  responseBody: unknown,
  durationMs: number,
  requestBody?: unknown,
): HttpLogEntry {
  const entry: HttpLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    method,
    url,
    status,
    responseBody,
    durationMs,
    at: new Date().toISOString(),
  };
  if (requestBody !== undefined) {
    entry.requestBody = requestBody;
  }
  return entry;
}

type CatalogResponse = {
  items: Array<{
    skuKey: string;
    priceInPaise: number;
    availableQty: number;
    inStock: boolean;
    leadDays: number;
  }>;
};

type SessionResponse = {
  session: { id: string };
};

type CompleteResponse = {
  order: { orderKey: string };
  payment: { shortUrl: string; paymentLinkId: string };
};

export async function runBuyerDemo(
  callbacks: BuyerDemoCallbacks,
): Promise<{ orderKey: string }> {
  const { onMessage, onLog } = callbacks;

  onMessage(msg("buyer", DEMO_BUYER_QUERY));

  const catalogResult = await a2aGet<CatalogResponse>("/a2a/catalog");
  onLog(
    logEntry(
      "GET",
      "/a2a/catalog",
      catalogResult.status,
      catalogResult.data,
      catalogResult.durationMs,
    ),
  );
  if (catalogResult.status >= 400) {
    throw new Error(`Catalog failed: ${catalogResult.status}`);
  }

  onMessage(
    msg(
      "system",
      "Filtering: price ≤ ₹2,000, in stock, ship within 7 days.",
    ),
  );

  const diya = catalogResult.data.items.find(
    (i) =>
      i.skuKey === "SKU:Diya-Large" &&
      i.priceInPaise <= 200000 &&
      i.inStock &&
      i.leadDays <= 7,
  );
  if (!diya) {
    throw new Error("SKU:Diya-Large not found matching demo filters");
  }

  const sessionBody = {
    lineItems: [{ skuKey: "SKU:Diya-Large", quantity: 1 }],
    buyer: {
      name: "Demo UAP Buyer",
      email: "buyer@agent.example",
      agentId: "karya-demo-buyer",
    },
    fulfillment: {
      type: "ship" as const,
      preferredBy: endOfThisWeekIso(),
    },
  };

  const sessionResult = await a2aPost<SessionResponse>(
    "/a2a/checkout/sessions",
    sessionBody,
  );
  onLog(
    logEntry(
      "POST",
      "/a2a/checkout/sessions",
      sessionResult.status,
      sessionResult.data,
      sessionResult.durationMs,
      sessionBody,
    ),
  );
  if (sessionResult.status >= 400) {
    throw new Error(`Checkout session failed: ${sessionResult.status}`);
  }

  onMessage(
    msg(
      "system",
      "Checkout session created. Completing with Razorpay test link…",
    ),
  );

  const completePath = `/a2a/checkout/sessions/${sessionResult.data.session.id}/complete`;
  const completeResult = await a2aPost<CompleteResponse>(completePath, {});
  onLog(
    logEntry(
      "POST",
      completePath,
      completeResult.status,
      completeResult.data,
      completeResult.durationMs,
      {},
    ),
  );
  if (completeResult.status >= 400) {
    throw new Error(`Checkout complete failed: ${completeResult.status}`);
  }

  const { orderKey } = completeResult.data.order;
  const { shortUrl } = completeResult.data.payment;
  onMessage(
    msg(
      "system",
      `Payment link ready: ${shortUrl}`,
    ),
  );

  return { orderKey };
}
