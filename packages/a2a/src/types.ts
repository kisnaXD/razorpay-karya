export type CatalogMerchant = {
  name: string;
  orgId: string;
  city?: string;
};

export type CatalogItem = {
  skuKey: string;
  name: string;
  description?: string;
  priceInPaise: number;
  currency: "INR";
  gstRatePercent: number;
  availableQty: number;
  leadDays: number;
  images: string[];
  inStock: boolean;
  canShipBy: string;
};

export type CatalogResponse = {
  merchant: CatalogMerchant;
  items: CatalogItem[];
  generatedAt: string;
};

export type CheckoutLineItem = {
  skuKey: string;
  quantity: number;
};

export type CheckoutBuyer = {
  name?: string;
  email?: string;
  agentId?: string;
};

export type CheckoutFulfillment = {
  type: "ship";
  preferredBy?: string;
};

export type CreateCheckoutSessionRequest = {
  lineItems: CheckoutLineItem[];
  buyer?: CheckoutBuyer;
  fulfillment?: CheckoutFulfillment;
};

export type CheckoutTotals = {
  subtotalInPaise: number;
  gstInPaise: number;
  totalInPaise: number;
};

export type CheckoutSessionFulfillment = {
  type: "ship";
  estimatedShipDate: string;
  leadDaysMax: number;
};

export type CheckoutSessionStatus =
  | "pending"
  | "completed"
  | "expired"
  | "cancelled";

export type CheckoutSession = {
  id: string;
  status: CheckoutSessionStatus;
  lineItems: CheckoutLineItem[];
  totals: CheckoutTotals;
  fulfillment: CheckoutSessionFulfillment;
  buyer?: CheckoutBuyer;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  salesOrderKey?: string;
  paymentLinkId?: string;
};

export type CreateCheckoutSessionResponse = {
  session: CheckoutSession;
};

export type CompleteCheckoutSessionResponse = {
  session: CheckoutSession;
  order: {
    id: string;
    orderKey: string;
    status: "pending_payment";
  };
  payment: {
    paymentLinkId: string;
    shortUrl: string;
    status: "created";
  };
};

export type A2AOrderStatus =
  | "pending_payment"
  | "paid"
  | "expired"
  | "cancelled";

export type A2AOrderResponse = {
  order: {
    id: string;
    orderKey?: string;
    sessionId: string;
    status: A2AOrderStatus;
    lineItems: CheckoutLineItem[];
    totals: CheckoutTotals;
    payment?: {
      paymentLinkId: string;
      shortUrl: string;
      status: string;
    };
    salesOrderKey?: string;
    createdAt: string;
    updatedAt: string;
  };
};

export type A2ASessionDocument = {
  _id: string;
  orgId: string;
  status: CheckoutSessionStatus;
  lineItems: CheckoutLineItem[];
  totals: CheckoutTotals;
  fulfillment: CheckoutSessionFulfillment;
  buyer?: CheckoutBuyer;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  salesOrderId?: string;
  salesOrderKey?: string;
  paymentNodeId?: string;
  paymentLinkId?: string;
  idempotencyKey?: string;
};
