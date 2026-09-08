import { clampAtZero, money, multiply, sum, toDecimal, ZERO } from "@/lib/money";
import { computeDuration } from "./duration";
import { selectDailyRate } from "./rates";
import type { Quote, QuoteInput, QuoteLine } from "./types";

const RATE_LABELS = {
  SEASONAL: "Seasonal rate",
  MONTHLY: "Monthly rate",
  WEEKLY: "Weekly rate",
  DAILY: "Daily rate",
} as const;

/**
 * The pricing engine (spec §25).
 *
 *   BASE RENTAL + LOCATION FEES + EXTRAS - DISCOUNTS = RENTAL TOTAL
 *
 * Pure: no database, no clock, no randomness. The same input always produces the
 * same quote, which is what makes it testable and what makes a customer's quote
 * reproducible weeks later in a dispute.
 *
 * The security deposit is computed and returned, but it is never added into
 * `total` and never treated as revenue (spec §10, §28, §97.8).
 */
export function computeQuote(input: QuoteInput): Quote {
  if (input.returnAt.getTime() <= input.pickupAt.getTime()) {
    throw new Error("Return time must be after pickup time");
  }

  const currency = input.currency ?? "MAD";
  const duration = computeDuration(
    input.pickupAt,
    input.returnAt,
    input.billing,
  );

  const rate = selectDailyRate({
    vehicle: input.vehicle,
    billableDays: duration.billableDays,
    pickupAt: input.pickupAt,
    timezone: input.timezone,
    seasonalRates: input.seasonalRates,
  });

  const lines: QuoteLine[] = [];

  // --- Base rental -----------------------------------------------------------
  const baseAmount = multiply(rate.dailyRate, duration.billableDays);
  lines.push({
    kind: "BASE",
    label: RATE_LABELS[rate.source],
    detail: `${duration.billableDays} ${duration.billableDays === 1 ? "day" : "days"} × ${rate.dailyRate} ${currency}${
      rate.seasonName ? ` · ${rate.seasonName}` : ""
    }`,
    amount: baseAmount.toFixed(2),
  });

  // --- Hourly overrun (EXTRA_HOURLY agencies only) ---------------------------
  const extraHoursAmount =
    duration.extraHours > 0
      ? multiply(input.billing.extraHourPrice, duration.extraHours)
      : ZERO;

  if (duration.extraHours > 0) {
    lines.push({
      kind: "EXTRA_HOURS",
      label: "Extra hours",
      detail: `${duration.extraHours} × ${money(input.billing.extraHourPrice).toFixed(2)} ${currency}`,
      amount: extraHoursAmount.toFixed(2),
    });
  }

  // --- Location fees (spec §22) ---------------------------------------------
  const pickupFee = money(input.pickupFee ?? 0);
  const returnFee = money(input.returnFee ?? 0);

  if (!pickupFee.isZero()) {
    lines.push({
      kind: "PICKUP_FEE",
      label: "Pickup location",
      amount: pickupFee.toFixed(2),
    });
  }
  if (!returnFee.isZero()) {
    lines.push({
      kind: "RETURN_FEE",
      label: "Return location",
      amount: returnFee.toFixed(2),
    });
  }

  // --- Extras ----------------------------------------------------------------
  let extrasAmount = ZERO;
  for (const extra of input.extras ?? []) {
    const quantity = Math.max(0, Math.trunc(extra.quantity));
    if (quantity === 0) continue;

    const units =
      extra.priceType === "PER_DAY" ? quantity * duration.billableDays : quantity;
    const amount = multiply(extra.unitPrice, units);
    extrasAmount = sum(extrasAmount, amount);

    lines.push({
      kind: "EXTRA",
      label: extra.name,
      detail:
        extra.priceType === "PER_DAY"
          ? `${quantity} × ${duration.billableDays} ${duration.billableDays === 1 ? "day" : "days"} × ${money(extra.unitPrice).toFixed(2)} ${currency}`
          : quantity > 1
            ? `${quantity} × ${money(extra.unitPrice).toFixed(2)} ${currency}`
            : undefined,
      amount: amount.toFixed(2),
    });
  }

  // --- Discount --------------------------------------------------------------
  const gross = sum(baseAmount, extraHoursAmount, pickupFee, returnFee, extrasAmount);

  // A discount never exceeds the amount being discounted, so a quote can't go
  // negative and turn into a payout.
  const requestedDiscount = money(input.discount ?? 0);
  const discountAmount = toDecimal(requestedDiscount).greaterThan(gross)
    ? gross
    : requestedDiscount;

  if (!discountAmount.isZero()) {
    lines.push({
      kind: "DISCOUNT",
      label: "Discount",
      amount: `-${discountAmount.toFixed(2)}`,
    });
  }

  const total = clampAtZero(toDecimal(gross).minus(discountAmount));

  return {
    duration,
    rate,
    baseAmount: baseAmount.toFixed(2),
    extraHoursAmount: extraHoursAmount.toFixed(2),
    pickupFee: pickupFee.toFixed(2),
    returnFee: returnFee.toFixed(2),
    extrasAmount: extrasAmount.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    total: total.toFixed(2),
    securityDeposit: money(input.vehicle.securityDeposit).toFixed(2),
    currency,
    lines,
  };
}
