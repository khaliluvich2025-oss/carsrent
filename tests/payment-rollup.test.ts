import { describe, expect, it } from "vitest";

import {
  computeDepositBalance,
  computePaymentRollup,
} from "@/server/services/payments/rollup";

const paid = (amount: string, type = "RENTAL_PAYMENT") => ({
  type,
  amount,
  status: "COMPLETED",
});

/** spec §31, §33, §81 */
describe("payment rollup", () => {
  it("reports an untouched reservation as unpaid", () => {
    const result = computePaymentRollup({
      finalTotal: "3200.00",
      payments: [],
    });
    expect(result).toMatchObject({
      paid: "0.00",
      due: "3200.00",
      remaining: "3200.00",
      status: "UNPAID",
    });
  });

  it("computes the spec §31 worked example", () => {
    // 3,200 total paid as 500 online + 2,000 cash + 700 card
    const result = computePaymentRollup({
      finalTotal: "3200.00",
      payments: [
        paid("500.00", "ONLINE_DEPOSIT"),
        paid("2000.00"),
        paid("700.00"),
      ],
    });

    expect(result.paid).toBe("3200.00");
    expect(result.remaining).toBe("0.00");
    expect(result.status).toBe("PAID");
  });

  it("reports a partial payment", () => {
    const result = computePaymentRollup({
      finalTotal: "3200.00",
      payments: [paid("500.00")],
    });
    expect(result.paid).toBe("500.00");
    expect(result.remaining).toBe("2700.00");
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("ignores transactions that did not complete", () => {
    const result = computePaymentRollup({
      finalTotal: "1000.00",
      payments: [
        { type: "RENTAL_PAYMENT", amount: "1000.00", status: "PENDING" },
        { type: "RENTAL_PAYMENT", amount: "500.00", status: "FAILED" },
      ],
    });
    expect(result.paid).toBe("0.00");
    expect(result.status).toBe("UNPAID");
  });

  it("subtracts refunds from the paid position", () => {
    const result = computePaymentRollup({
      finalTotal: "2000.00",
      payments: [paid("2000.00"), paid("500.00", "REFUND")],
    });
    expect(result.paid).toBe("1500.00");
    expect(result.refunded).toBe("500.00");
    expect(result.status).toBe("PARTIALLY_REFUNDED");
  });

  it("reports a fully refunded reservation", () => {
    const result = computePaymentRollup({
      finalTotal: "2000.00",
      payments: [paid("2000.00"), paid("2000.00", "REFUND")],
    });
    expect(result.paid).toBe("0.00");
    expect(result.status).toBe("REFUNDED");
  });

  it("never reports a negative remaining when overpaid", () => {
    const result = computePaymentRollup({
      finalTotal: "1000.00",
      payments: [paid("1200.00")],
    });
    expect(result.remaining).toBe("0.00");
    expect(result.status).toBe("PAID");
  });

  describe("additional charges (spec §33, §48)", () => {
    it("adds charges the customer pays directly", () => {
      const result = computePaymentRollup({
        finalTotal: "2000.00",
        payments: [paid("2000.00")],
        charges: [{ amount: "300.00", settleFromDeposit: false }],
      });
      expect(result.due).toBe("2300.00");
      expect(result.remaining).toBe("300.00");
      expect(result.status).toBe("PARTIALLY_PAID");
    });

    it("excludes charges settled from the deposit", () => {
      // Recovered from money already held, so not owed at the counter.
      const result = computePaymentRollup({
        finalTotal: "2000.00",
        payments: [paid("2000.00")],
        charges: [{ amount: "300.00", settleFromDeposit: true }],
      });
      expect(result.due).toBe("2000.00");
      expect(result.remaining).toBe("0.00");
      expect(result.status).toBe("PAID");
    });

    it("handles a mix of both", () => {
      const result = computePaymentRollup({
        finalTotal: "2000.00",
        payments: [paid("2000.00")],
        charges: [
          { amount: "300.00", settleFromDeposit: true },
          { amount: "150.00", settleFromDeposit: false },
        ],
      });
      expect(result.due).toBe("2150.00");
      expect(result.remaining).toBe("150.00");
    });
  });

  it("keeps two decimal places on every figure", () => {
    const result = computePaymentRollup({
      finalTotal: "1000",
      payments: [paid("333.33"), paid("333.33")],
    });
    for (const value of [result.paid, result.due, result.remaining]) {
      expect(value).toMatch(/^\d+\.\d{2}$/);
    }
    expect(result.paid).toBe("666.66");
    expect(result.remaining).toBe("333.34");
  });
});

/** spec §28, §33 — deposit money is tracked entirely separately */
describe("deposit balance", () => {
  it("reports what is still held", () => {
    expect(
      computeDepositBalance({
        collectedAmount: "3000.00",
        refundedAmount: "0.00",
        retainedAmount: "0.00",
      }),
    ).toBe("3000.00");
  });

  it("computes the spec §33 settlement", () => {
    // 3,000 collected, 1,150 retained for charges, 1,850 refunded
    expect(
      computeDepositBalance({
        collectedAmount: "3000.00",
        refundedAmount: "1850.00",
        retainedAmount: "1150.00",
      }),
    ).toBe("0.00");
  });

  it("reports a partially settled deposit", () => {
    expect(
      computeDepositBalance({
        collectedAmount: "3000.00",
        refundedAmount: "0.00",
        retainedAmount: "1150.00",
      }),
    ).toBe("1850.00");
  });

  it("never goes negative", () => {
    expect(
      computeDepositBalance({
        collectedAmount: "1000.00",
        refundedAmount: "800.00",
        retainedAmount: "500.00",
      }),
    ).toBe("0.00");
  });
});
