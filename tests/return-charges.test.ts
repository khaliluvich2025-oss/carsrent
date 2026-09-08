import { describe, expect, it } from "vitest";

import type { BillingSettings } from "@/server/services/pricing";
import {
  computeFuelCharge,
  computeLateReturn,
  computeMileageCharge,
  settleDeposit,
} from "@/server/services/returns/charges";

const at = (iso: string) => new Date(iso);

const grace: BillingSettings = {
  rule: "GRACE_PERIOD",
  gracePeriodMinutes: 60,
  extraHourPrice: "80.00",
};
const hourly: BillingSettings = { ...grace, rule: "EXTRA_HOURLY" };
const roundUp: BillingSettings = { ...grace, rule: "DAY_ROUND_UP" };

const scheduled = at("2026-09-15T18:00:00Z");

/** spec §44 */
describe("late return", () => {
  it("charges nothing when the car is back on time", () => {
    const result = computeLateReturn({
      scheduledReturnAt: scheduled,
      actualReturnAt: scheduled,
      billing: grace,
      dailyRate: "450.00",
    });
    expect(result.lateMinutes).toBe(0);
    expect(result.amount).toBe("0.00");
  });

  it("charges nothing when the car is back early", () => {
    const result = computeLateReturn({
      scheduledReturnAt: scheduled,
      actualReturnAt: at("2026-09-15T16:00:00Z"),
      billing: grace,
      dailyRate: "450.00",
    });
    expect(result.lateMinutes).toBe(0);
    expect(result.amount).toBe("0.00");
  });

  it("reports the delay from the spec §44 example", () => {
    // Scheduled 18:00, returned 20:30 -> 2h 30m
    const result = computeLateReturn({
      scheduledReturnAt: scheduled,
      actualReturnAt: at("2026-09-15T20:30:00Z"),
      billing: grace,
      dailyRate: "450.00",
    });
    expect(result.lateMinutes).toBe(150);
    expect(result.delayLabel).toBe("2h 30m");
  });

  describe("grace period rule", () => {
    it("forgives a delay inside the grace", () => {
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-15T18:45:00Z"),
        billing: grace,
        dailyRate: "450.00",
      });
      expect(result.gracedMinutes).toBe(45);
      expect(result.amount).toBe("0.00");
    });

    it("forgives exactly the grace boundary", () => {
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-15T19:00:00Z"),
        billing: grace,
        dailyRate: "450.00",
      });
      expect(result.amount).toBe("0.00");
    });

    it("charges a whole day one minute past the grace", () => {
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-15T19:01:00Z"),
        billing: grace,
        dailyRate: "450.00",
      });
      expect(result.chargeableDays).toBe(1);
      expect(result.amount).toBe("450.00");
    });

    it("charges two days when a day and a half late", () => {
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-17T06:00:00Z"),
        billing: grace,
        dailyRate: "450.00",
      });
      expect(result.chargeableDays).toBe(2);
      expect(result.amount).toBe("900.00");
    });

    it("applies the grace once, not once per day", () => {
      // Two days and ten minutes late is still two days chargeable, because
      // 2d10m minus one hour of grace still rounds up to 2 days.
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-17T18:10:00Z"),
        billing: grace,
        dailyRate: "450.00",
      });
      expect(result.gracedMinutes).toBe(60);
      expect(result.chargeableDays).toBe(2);
    });
  });

  describe("hourly rule", () => {
    it("charges started hours past the grace", () => {
      // 2h30m late, 1h graced -> 1h30m chargeable -> 2 started hours
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-15T20:30:00Z"),
        billing: hourly,
        dailyRate: "450.00",
      });
      expect(result.chargeableDays).toBe(0);
      expect(result.chargeableHours).toBe(2);
      expect(result.amount).toBe("160.00");
    });

    it("splits a long delay into days plus hours", () => {
      // 26h late, 1h graced -> 25h -> 1 day + 1 hour
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-16T20:00:00Z"),
        billing: hourly,
        dailyRate: "450.00",
      });
      expect(result.chargeableDays).toBe(1);
      expect(result.chargeableHours).toBe(1);
      expect(result.amount).toBe("530.00");
    });
  });

  describe("round-up rule", () => {
    it("ignores the grace entirely", () => {
      const result = computeLateReturn({
        scheduledReturnAt: scheduled,
        actualReturnAt: at("2026-09-15T18:10:00Z"),
        billing: roundUp,
        dailyRate: "450.00",
      });
      expect(result.chargeableDays).toBe(1);
      expect(result.amount).toBe("450.00");
    });
  });
});

/** spec §45 */
describe("mileage charge", () => {
  it("charges nothing on an unlimited policy", () => {
    const result = computeMileageCharge({
      pickupMileage: 18400,
      returnMileage: 20400,
      billableDays: 5,
      policy: "UNLIMITED",
    });
    expect(result.distance).toBe(2000);
    expect(result.unlimited).toBe(true);
    expect(result.amount).toBe("0.00");
  });

  it("charges nothing within the allowance", () => {
    const result = computeMileageCharge({
      pickupMileage: 18400,
      returnMileage: 19400,
      billableDays: 5,
      policy: "LIMITED",
      kmPerDay: 250,
      extraKmPrice: "3.50",
    });
    expect(result.allowance).toBe(1250);
    expect(result.excess).toBe(0);
    expect(result.amount).toBe("0.00");
  });

  it("charges the excess beyond the allowance", () => {
    const result = computeMileageCharge({
      pickupMileage: 18400,
      returnMileage: 20000,
      billableDays: 5,
      policy: "LIMITED",
      kmPerDay: 250,
      extraKmPrice: "3.50",
    });
    expect(result.distance).toBe(1600);
    expect(result.allowance).toBe(1250);
    expect(result.excess).toBe(350);
    expect(result.amount).toBe("1225.00");
  });

  it("treats a backwards odometer as zero distance, not negative", () => {
    const result = computeMileageCharge({
      pickupMileage: 20000,
      returnMileage: 18400,
      billableDays: 5,
      policy: "LIMITED",
      kmPerDay: 250,
      extraKmPrice: "3.50",
    });
    expect(result.distance).toBe(0);
    expect(result.amount).toBe("0.00");
  });

  it("falls back to unlimited when the allowance is not configured", () => {
    const result = computeMileageCharge({
      pickupMileage: 0,
      returnMileage: 5000,
      billableDays: 1,
      policy: "LIMITED",
      kmPerDay: null,
      extraKmPrice: "3.50",
    });
    expect(result.unlimited).toBe(true);
    expect(result.amount).toBe("0.00");
  });

  it("gives at least one day of allowance", () => {
    const result = computeMileageCharge({
      pickupMileage: 0,
      returnMileage: 100,
      billableDays: 0,
      policy: "LIMITED",
      kmPerDay: 250,
      extraKmPrice: "3.50",
    });
    expect(result.allowance).toBe(250);
    expect(result.amount).toBe("0.00");
  });
});

/** spec §46 */
describe("fuel charge", () => {
  it("computes the spec §46 example", () => {
    // Out at 100%, back at 50% -> 50 percentage points missing
    const result = computeFuelCharge({
      pickupLevel: 100,
      returnLevel: 50,
      policy: "FULL_TO_FULL",
      pricePerPercent: "6.00",
    });
    expect(result.missingPercent).toBe(50);
    expect(result.amount).toBe("300.00");
    expect(result.chargeable).toBe(true);
  });

  it("charges nothing when the tank comes back fuller", () => {
    const result = computeFuelCharge({
      pickupLevel: 50,
      returnLevel: 100,
      policy: "FULL_TO_FULL",
      pricePerPercent: "6.00",
    });
    expect(result.missingPercent).toBe(0);
    expect(result.amount).toBe("0.00");
    expect(result.chargeable).toBe(false);
  });

  it("charges nothing on a prepaid policy", () => {
    const result = computeFuelCharge({
      pickupLevel: 100,
      returnLevel: 10,
      policy: "PREPAID",
      pricePerPercent: "6.00",
    });
    expect(result.missingPercent).toBe(90);
    expect(result.amount).toBe("0.00");
  });

  it("charges nothing when no fuel price is configured", () => {
    const result = computeFuelCharge({
      pickupLevel: 100,
      returnLevel: 50,
      policy: "FULL_TO_FULL",
      pricePerPercent: null,
    });
    expect(result.amount).toBe("0.00");
    expect(result.chargeable).toBe(false);
  });
});

/** spec §33 */
describe("deposit settlement", () => {
  it("refunds the whole deposit when nothing is charged", () => {
    const result = settleDeposit({
      heldAmount: "3000.00",
      chargesFromDeposit: [],
    });
    expect(result.retained).toBe("0.00");
    expect(result.refund).toBe("3000.00");
    expect(result.shortfall).toBe("0.00");
  });

  it("computes the spec §33 worked example", () => {
    // 3,000 held, 1,150 of charges -> 1,850 refunded
    const result = settleDeposit({
      heldAmount: "3000.00",
      chargesFromDeposit: ["200.00", "150.00", "300.00", "500.00"],
    });
    expect(result.chargedToDeposit).toBe("1150.00");
    expect(result.retained).toBe("1150.00");
    expect(result.refund).toBe("1850.00");
    expect(result.shortfall).toBe("0.00");
  });

  it("retains the whole deposit and reports a shortfall when charges exceed it", () => {
    const result = settleDeposit({
      heldAmount: "2000.00",
      chargesFromDeposit: ["3500.00"],
    });
    expect(result.retained).toBe("2000.00");
    expect(result.refund).toBe("0.00");
    expect(result.shortfall).toBe("1500.00");
  });

  it("handles a deposit that was never collected", () => {
    const result = settleDeposit({
      heldAmount: "0.00",
      chargesFromDeposit: ["500.00"],
    });
    expect(result.retained).toBe("0.00");
    expect(result.refund).toBe("0.00");
    expect(result.shortfall).toBe("500.00");
  });

  it("keeps every figure to two decimal places", () => {
    const result = settleDeposit({
      heldAmount: "1000",
      chargesFromDeposit: ["333.33", "333.33"],
    });
    expect(result.retained).toBe("666.66");
    expect(result.refund).toBe("333.34");
  });
});
