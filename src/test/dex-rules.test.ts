import { describe, expect, it } from "vitest";

import { formatNaira, isValidNigerianPhone } from "@/lib/dex-rules";

describe("Nigerian mobile number validation", () => {
  it("accepts the 11-digit local format used for data orders", () => {
    expect(isValidNigerianPhone("08012345678")).toBe(true);
  });

  it("rejects numbers without the leading zero or full 11 digits", () => {
    expect(isValidNigerianPhone("8012345678")).toBe(false);
    expect(isValidNigerianPhone("0801234567")).toBe(false);
  });
});

describe("Naira formatting", () => {
  it("shows amounts with the Nigerian naira symbol", () => {
    expect(formatNaira(320)).toContain("₦");
    expect(formatNaira(320)).toContain("320");
  });
});