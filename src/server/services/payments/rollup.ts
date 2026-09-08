import type { PaymentStatus } from "@prisma/client";

import { clampAtZero, subtract, sum, toDecimal, type MoneyInput } from "@/lib/money";

/**
 * A reservation's payment position (spec §31, §81).
 *
 * Derived by summing transactions, never by trusting a stored total. The
 * `amountPaid` and `amountRemaining` columns are caches of this calculation, so
 * this function is the definition and they are the copy.
 *
 * Pure, so the arithmetic that decides what a customer owes at the counter can
 * be tested without a database.
 */

export type PaymentRow = {
  /** REFUND moves money back out; every other type brings it in */
  type: string;
  amount: MoneyInput;
  /** Only COMPLETED transactions count towards the position */
  status: string;
};

export type ChargeRow = {
  amount: MoneyInput;
  /** Charges taken out of the deposit are not owed at the counter (spec §33) */
  settleFromDeposit: boolean;
};

export type PaymentRollup = {
  /** Received, net of refunds */
  paid: string;
  /** Rental total plus charges owed directly */
  due: string;
  remaining: string;
  refunded: string;
  status: PaymentStatus;
};

export function computePaymentRollup(input: {
  finalTotal: MoneyInput;
  payments: PaymentRow[];
  charges?: ChargeRow[];
}): PaymentRollup {
  const completed = input.payments.filter(
    (payment) => payment.status === "COMPLETED",
  );

  const received = sum(
    ...completed
      .filter((payment) => payment.type !== "REFUND")
      .map((payment) => payment.amount),
  );
  const refunded = sum(
    ...completed
      .filter((payment) => payment.type === "REFUND")
      .map((payment) => payment.amount),
  );

  const paid = subtract(received, refunded);

  // Charges settled from the deposit are recovered there, not collected again.
  const directCharges = sum(
    ...(input.charges ?? [])
      .filter((charge) => !charge.settleFromDeposit)
      .map((charge) => charge.amount),
  );

  const due = sum(input.finalTotal, directCharges);
  const remaining = clampAtZero(subtract(due, paid));

  let status: PaymentStatus;
  if (toDecimal(refunded).greaterThan(0)) {
    // A refund has happened: say so, and distinguish partial from full.
    status = toDecimal(paid).lessThanOrEqualTo(0)
      ? "REFUNDED"
      : "PARTIALLY_REFUNDED";
  } else if (toDecimal(paid).lessThanOrEqualTo(0)) {
    status = "UNPAID";
  } else if (toDecimal(paid).greaterThanOrEqualTo(toDecimal(due))) {
    status = "PAID";
  } else {
    status = "PARTIALLY_PAID";
  }

  return {
    paid: paid.toFixed(2),
    due: due.toFixed(2),
    remaining: remaining.toFixed(2),
    refunded: refunded.toFixed(2),
    status,
  };
}

/**
 * The deposit's own position (spec §28, §33).
 *
 * Deliberately separate from the rental rollup: deposit money is held on behalf
 * of the customer and is never revenue, so it must never be able to leak into
 * the paid/remaining figures above.
 */
export function computeDepositBalance(deposit: {
  collectedAmount: MoneyInput;
  refundedAmount: MoneyInput;
  retainedAmount: MoneyInput;
}): string {
  return clampAtZero(
    subtract(
      deposit.collectedAmount,
      sum(deposit.refundedAmount, deposit.retainedAmount),
    ),
  ).toFixed(2);
}
