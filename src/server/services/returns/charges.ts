import { Decimal, money, multiply, type MoneyInput } from "@/lib/money";
import type { BillingSettings } from "@/server/services/pricing";

/**
 * Return charges (spec §44, §45, §46, §48).
 *
 * Pure functions: times and readings in, money out. These decide what a customer
 * is asked to pay at the counter after their trip, often while they are standing
 * there disagreeing — so every one of them has to be explainable, reproducible,
 * and provable without a database.
 *
 * None of them decide anything on their own. An employee confirms every charge
 * before it is applied (spec §47), and each returns its workings so the screen
 * can show why the number is what it is.
 */

const MINUTES_PER_DAY = 24 * 60;

// ---------------------------------------------------------------------------
// Late return (spec §44)
// ---------------------------------------------------------------------------

export type LateReturnResult = {
  lateMinutes: number;
  gracedMinutes: number;
  chargeableDays: number;
  chargeableHours: number;
  amount: string;
  /** Human-readable delay, e.g. "2h 30m" */
  delayLabel: string;
};

function formatDelay(minutes: number): string {
  if (minutes <= 0) return "0m";
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / 60);
  const mins = minutes % 60;

  return [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    mins > 0 ? `${mins}m` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * What a late return costs, under the agency's billing rule.
 *
 * The grace period is applied to the overrun as a whole, not per day — a car
 * two days and ten minutes late is not forgiven twice.
 */
export function computeLateReturn(input: {
  scheduledReturnAt: Date;
  actualReturnAt: Date;
  billing: BillingSettings;
  dailyRate: MoneyInput;
}): LateReturnResult {
  const lateMinutes = Math.max(
    0,
    Math.round(
      (input.actualReturnAt.getTime() - input.scheduledReturnAt.getTime()) /
        60_000,
    ),
  );

  const empty: LateReturnResult = {
    lateMinutes,
    gracedMinutes: 0,
    chargeableDays: 0,
    chargeableHours: 0,
    amount: "0.00",
    delayLabel: formatDelay(lateMinutes),
  };

  if (lateMinutes === 0) return empty;

  const grace = Math.max(0, input.billing.gracePeriodMinutes);

  if (input.billing.rule === "DAY_ROUND_UP") {
    // No grace under this rule: any part of a day late is a whole day.
    const days = Math.ceil(lateMinutes / MINUTES_PER_DAY);
    return {
      ...empty,
      chargeableDays: days,
      amount: multiply(input.dailyRate, days).toFixed(2),
    };
  }

  if (lateMinutes <= grace) {
    return { ...empty, gracedMinutes: lateMinutes };
  }

  const chargeable = lateMinutes - grace;

  if (input.billing.rule === "GRACE_PERIOD") {
    const days = Math.ceil(chargeable / MINUTES_PER_DAY);
    return {
      ...empty,
      gracedMinutes: grace,
      chargeableDays: days,
      amount: multiply(input.dailyRate, days).toFixed(2),
    };
  }

  // EXTRA_HOURLY: whole days at the daily rate, the remainder by started hour.
  const days = Math.floor(chargeable / MINUTES_PER_DAY);
  const hours = Math.ceil((chargeable - days * MINUTES_PER_DAY) / 60);

  return {
    ...empty,
    gracedMinutes: grace,
    chargeableDays: days,
    chargeableHours: hours,
    amount: money(
      multiply(input.dailyRate, days).plus(
        multiply(input.billing.extraHourPrice, hours),
      ),
    ).toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// Mileage (spec §45)
// ---------------------------------------------------------------------------

export type MileageResult = {
  distance: number;
  allowance: number | null;
  excess: number;
  amount: string;
  unlimited: boolean;
};

export function computeMileageCharge(input: {
  pickupMileage: number;
  returnMileage: number;
  billableDays: number;
  policy: "UNLIMITED" | "LIMITED";
  kmPerDay?: number | null;
  extraKmPrice?: MoneyInput | null;
}): MileageResult {
  // A reading that went backwards is a typo, not negative distance.
  const distance = Math.max(0, input.returnMileage - input.pickupMileage);

  if (
    input.policy === "UNLIMITED" ||
    input.kmPerDay == null ||
    input.extraKmPrice == null
  ) {
    return {
      distance,
      allowance: null,
      excess: 0,
      amount: "0.00",
      unlimited: true,
    };
  }

  const allowance = input.kmPerDay * Math.max(1, input.billableDays);
  const excess = Math.max(0, distance - allowance);

  return {
    distance,
    allowance,
    excess,
    amount: multiply(input.extraKmPrice, excess).toFixed(2),
    unlimited: false,
  };
}

// ---------------------------------------------------------------------------
// Fuel (spec §46)
// ---------------------------------------------------------------------------

export type FuelResult = {
  pickupLevel: number;
  returnLevel: number;
  missingPercent: number;
  amount: string;
  chargeable: boolean;
};

/**
 * Fuel is charged on the shortfall against the level the car left with.
 *
 * FULL_TO_FULL and SAME_AS_PICKUP behave identically here — both mean "bring it
 * back as you found it" — and differ only in the wording on the contract.
 * PREPAID means the customer already bought the tank, so nothing is owed.
 */
export function computeFuelCharge(input: {
  pickupLevel: number;
  returnLevel: number;
  policy: "FULL_TO_FULL" | "SAME_AS_PICKUP" | "PREPAID";
  pricePerPercent?: MoneyInput | null;
}): FuelResult {
  const missing = Math.max(0, input.pickupLevel - input.returnLevel);

  if (input.policy === "PREPAID" || input.pricePerPercent == null) {
    return {
      pickupLevel: input.pickupLevel,
      returnLevel: input.returnLevel,
      missingPercent: missing,
      amount: "0.00",
      chargeable: false,
    };
  }

  return {
    pickupLevel: input.pickupLevel,
    returnLevel: input.returnLevel,
    missingPercent: missing,
    amount: multiply(input.pricePerPercent, missing).toFixed(2),
    chargeable: missing > 0,
  };
}

// ---------------------------------------------------------------------------
// Deposit settlement (spec §33)
// ---------------------------------------------------------------------------

export type DepositSettlement = {
  held: string;
  chargedToDeposit: string;
  retained: string;
  refund: string;
  /** Charges that exceed the deposit and must be collected separately */
  shortfall: string;
};

/**
 * How a deposit is settled against the charges raised at return (spec §33).
 *
 * The agency chooses per charge whether it comes out of the deposit or is paid
 * separately. This computes the outcome of those choices: what is retained, what
 * goes back, and what is still owed if the damage outran the deposit.
 */
export function settleDeposit(input: {
  heldAmount: MoneyInput;
  chargesFromDeposit: MoneyInput[];
}): DepositSettlement {
  const held = money(input.heldAmount);
  // Annotated: without it the accumulator is inferred as MoneyInput from the
  // array's element type rather than as the Decimal the seed actually is.
  const requested = input.chargesFromDeposit.reduce<Decimal>(
    (total, amount) => total.plus(money(amount)),
    money(0),
  );

  const retained = requested.greaterThan(held) ? held : money(requested);
  const refund = money(held.minus(retained));
  const shortfall = requested.greaterThan(held)
    ? money(requested.minus(held))
    : money(0);

  return {
    held: held.toFixed(2),
    chargedToDeposit: money(requested).toFixed(2),
    retained: retained.toFixed(2),
    refund: refund.toFixed(2),
    shortfall: shortfall.toFixed(2),
  };
}
