import { afterEach, describe, expect, it } from "vitest";
import { apiUrl, getApiBaseUrl } from "./api-base";

describe("api-base", () => {
  const original = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = original;
    }
  });

  it("defaults to localhost:4000 when unset", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(getApiBaseUrl()).toBe("http://localhost:4000");
    expect(apiUrl("/v1/bootstrap")).toBe("http://localhost:4000/v1/bootstrap");
  });

  it("uses empty base for same-origin Docker/Caddy", () => {
    process.env.NEXT_PUBLIC_API_URL = "";
    expect(getApiBaseUrl()).toBe("");
    expect(apiUrl("/v1/nodes")).toBe("/v1/nodes");
  });

  it("uses configured production API host", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    expect(apiUrl("/health")).toBe("https://api.example.com/health");
  });
});
