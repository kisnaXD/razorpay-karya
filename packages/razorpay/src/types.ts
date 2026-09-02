export type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

export type RazorpayPaymentLink = {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "partially_paid" | "cancelled" | "expired";
  created_at: number;
};

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}
