import type { RazorpayCredentials } from "./types.js";
import { RazorpayError } from "./types.js";

const BASE_URL = "https://api.razorpay.com/v1";

export class RazorpayClient {
  constructor(private readonly creds: RazorpayCredentials) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.creds.keyId}:${this.creds.keySecret}`).toString("base64")}`;
  }

  async post<T>(
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader(),
      "Content-Type": "application/json",
    };
    if (idempotencyKey) {
      headers["X-Razorpay-Idempotency-Key"] = idempotencyKey;
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      throw new RazorpayError(`Razorpay ${path} failed`, res.status, json);
    }
    return json as T;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: this.authHeader(),
      },
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      throw new RazorpayError(`Razorpay ${path} failed`, res.status, json);
    }
    return json as T;
  }
}
