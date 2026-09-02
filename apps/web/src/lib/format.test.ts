import { describe, expect, it } from "vitest";
import { formatInr, orderStatusTone } from "./format.js";

describe("formatInr", () => {
  it("formats lakhs from paise", () => {
    expect(formatInr(42000000)).toBe("₹4.20L");
  });

  it("formats thousands from paise", () => {
    expect(formatInr(1480000)).toBe("₹14.8k");
  });
});

describe("orderStatusTone", () => {
  it("maps late to warn", () => {
    expect(orderStatusTone("late")).toBe("warn");
  });
});
