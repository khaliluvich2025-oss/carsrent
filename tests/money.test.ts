import { describe, expect, it } from "vitest";

import {
  clampAtZero,
  formatMoney,
  money,
  multiply,
  percentOf,
  subtract,
  sum,
  toDecimal,
} from "@/lib/money";

/** spec §94 — deterministic decimal arithmetic, never JS floats. */
describe("money", () => {
  it("does not inherit binary floating-point error", () => {
    expect(sum(0.1, 0.2).toString()).toBe("0.3");
    expect(sum("0.1", "0.2").toString()).toBe("0.3");
  });

  it("rounds half-up to two places, the way an invoice does", () => {
    expect(money("2.345").toString()).toBe("2.35");
    expect(money("2.344").toString()).toBe("2.34");
    expect(money("-2.345").toString()).toBe("-2.35");
  });

  it("computes the spec §10 worked example", () => {
    // 5 days x 450 MAD + 150 MAD airport pickup = 2,400 MAD
    const base = multiply("450.00", 5);
    const total = sum(base, "150.00");

    expect(base.toString()).toBe("2250");
    expect(total.toString()).toBe("2400");
  });

  it("computes the spec §33 deposit settlement", () => {
    // 3,000 deposit - 1,150 charges = 1,850 refund
    expect(subtract("3000.00", "1150.00").toString()).toBe("1850");
  });

  it("computes the spec §48 additional charges total", () => {
    expect(sum("200.00", "150.00", "300.00", "700.00").toString()).toBe("1350");
  });

  it("takes a percentage without drift", () => {
    // 30% online deposit on 3,200 MAD (spec §29)
    expect(percentOf("3200.00", 30).toString()).toBe("960");
    expect(percentOf("2333.33", 30).toString()).toBe("700");
  });

  it("never reports a negative balance remaining", () => {
    expect(clampAtZero("-25.00").toString()).toBe("0");
    expect(clampAtZero("25.00").toString()).toBe("25");
  });

  it("accepts the Decimal-like values Prisma returns", () => {
    const prismaLike = { toString: () => "1234.56" };
    expect(toDecimal(prismaLike).toString()).toBe("1234.56");
    expect(sum(prismaLike, "0.44").toString()).toBe("1235");
  });

  it("rejects a non-finite amount rather than storing NaN", () => {
    expect(() => toDecimal(Number.NaN)).toThrow();
    expect(() => toDecimal(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("formats in MAD by default", () => {
    // Group separators vary between ICU builds, so assert on the digits and the
    // decimal comma rather than on the exact grouping character.
    const formatted = formatMoney("2400.00");
    expect(formatted.replace(/\D/g, "")).toBe("240000");
    expect(formatted).toContain(",00");
    expect(formatted).toContain("MAD");
  });
});
