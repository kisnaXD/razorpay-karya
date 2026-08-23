import { describe, expect, it } from "vitest";
import type { Bootstrap } from "./api.js";

describe("Bootstrap contract", () => {
  it("matches API field names from GET /v1/bootstrap", () => {
    const sample: Bootstrap = {
      org: {
        _id: "n1",
        type: "Org",
        key: "Org:Arka-Atelier",
        label: "Arka Atelier",
      },
      exceptionCount: 5,
      cashInPaise: 42000000,
    };

    expect(sample.exceptionCount).toBe(5);
    expect(sample.cashInPaise).toBe(42000000);
    expect(sample.org.label).toBe("Arka Atelier");
  });
});
