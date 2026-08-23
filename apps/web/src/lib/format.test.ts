import { describe, expect, it } from "vitest";
import { formatCash } from "./format.js";

describe("formatCash", () => {
  it("formats lakhs from paise", () => {
    expect(formatCash(42000000)).toBe("₹4.20L");
  });

  it("formats thousands from paise", () => {
    expect(formatCash(125000)).toBe("₹1.3K");
  });
});
