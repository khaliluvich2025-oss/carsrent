import type { PaymentMethod, TransactionType } from "@prisma/client";

import { money, subtract, sum, toDecimal } from "@/lib/money";
import type { TenantDb } from "@/server/tenant";
import { computePaymentRollup } from "./rollup";

/**
 * Recording money (spec §31, §32, §33, §81).
 *
 * Every movement is a row. Nothing is ever edited to "correct" a total — a
 * mistake is fixed with another transaction, so the history stays true.
 */

export class PaymentValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

/**
 * Recompute the reservation's cached payment columns from its transactions.
 *
 * Called inside the same transaction as every write that can move the position,
 * so the cache can never be stale relative to the rows it summarises.
 */
export async function refreshReservationPayment(
  tx: TenantDb,
  reservationId: string,
): Promise<void> {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: {
      finalTotal: true,
      payments: { select: { type: true, amount: true, status: true } },
      additionalCharges: {
        select: { amount: true, settleFromDeposit: true },
      },
    },
  });
  if (!reservation) return;

  const rollup = computePaymentRollup({
    finalTotal: reservation.finalTotal,
    payments: reservation.payments,
    charges: reservation.additionalCharges,
  });

  await tx.reservation.update({
    where: { id: reservationId },
    data: {
      amountPaid: rollup.paid,
      amountRemaining: rollup.remaining,
      paymentStatus: rollup.status,
    },
  });
}

export type RecordPaymentInput = {
  reservationId: string;
  type: TransactionType;
  amount: string;
  method: PaymentMethod;
  transactionReference?: string | null;
  notes?: string | null;
  userId: string;
};

export async function recordPayment(
  db: TenantDb,
  input: RecordPaymentInput,
): Promise<{ id: string }> {
  const agencyId = db.$agencyId;
  const amount = money(input.amount);

  if (toDecimal(amount).lessThanOrEqualTo(0)) {
    throw new PaymentValidationError("amount", "Enter an amount above zero.");
  }

  const reservation = await db.reservation.findUnique({
    where: { id: input.reservationId },
    select: { id: true, currency: true, status: true },
  });
  if (!reservation) {
    throw new PaymentValidationError("amount", "Reservation not found.");
  }
  if (reservation.status === "CANCELLED") {
    throw new PaymentValidationError(
      "amount",
      "This reservation is cancelled. Record a refund instead.",
    );
  }

  return db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        agencyId,
        reservationId: input.reservationId,
        type: input.type,
        amount: amount.toFixed(2),
        method: input.method,
        status: "COMPLETED",
        currency: reservation.currency,
        transactionReference: input.transactionReference || null,
        notes: input.notes || null,
        createdById: input.userId,
      },
      select: { id: true },
    });

    await refreshReservationPayment(tx as TenantDb, input.reservationId);

    await tx.auditLog.create({
      data: {
        agencyId,
        userId: input.userId,
        action:
          input.type === "REFUND" ? "payment.refund" : "payment.record",
        entityType: "Reservation",
        entityId: input.reservationId,
        newValue: {
          type: input.type,
          amount: amount.toFixed(2),
          method: input.method,
        },
      },
    });

    return payment;
  });
}

export type CollectDepositInput = {
  reservationId: string;
  amount: string;
  method: PaymentMethod;
  notes?: string | null;
  userId: string;
};

/**
 * Take the security deposit (spec §28).
 *
 * Written to `security_deposits`, never to `payments` — deposit money is held on
 * behalf of the customer and must not appear anywhere revenue is counted
 * (spec §97.8).
 */
export async function collectDeposit(
  db: TenantDb,
  input: CollectDepositInput,
): Promise<void> {
  const agencyId = db.$agencyId;
  const amount = money(input.amount);

  if (toDecimal(amount).isNegative()) {
    throw new PaymentValidationError("amount", "The deposit cannot be negative.");
  }

  const reservation = await db.reservation.findUnique({
    where: { id: input.reservationId },
    select: {
      id: true,
      currency: true,
      securityDepositRequired: true,
      securityDeposit: { select: { id: true, collectedAmount: true } },
    },
  });
  if (!reservation) {
    throw new PaymentValidationError("amount", "Reservation not found.");
  }

  const existing = reservation.securityDeposit;
  const newCollected = existing
    ? sum(existing.collectedAmount, amount)
    : amount;

  if (existing) {
    await db.securityDeposit.update({
      where: { id: existing.id },
      data: {
        collectedAmount: newCollected.toFixed(2),
        method: input.method,
        status: toDecimal(newCollected).greaterThan(0) ? "HELD" : "REQUIRED",
        collectedAt: new Date(),
        notes: input.notes || undefined,
      },
    });
  } else {
    await db.securityDeposit.create({
      data: {
        agencyId,
        reservationId: input.reservationId,
        requiredAmount: reservation.securityDepositRequired,
        collectedAmount: newCollected.toFixed(2),
        method: input.method,
        status: toDecimal(newCollected).greaterThan(0) ? "HELD" : "REQUIRED",
        currency: reservation.currency,
        collectedAt: new Date(),
        notes: input.notes || null,
        createdById: input.userId,
      },
    });
  }

  await db.auditLog.create({
    data: {
      agencyId,
      userId: input.userId,
      action: "deposit.collect",
      entityType: "Reservation",
      entityId: input.reservationId,
      newValue: { amount: amount.toFixed(2), method: input.method },
    },
  });
}

/** What is still owed, for display at the counter. */
export function remainingAfter(
  finalTotal: string,
  amountPaid: string,
): string {
  return subtract(finalTotal, amountPaid).toFixed(2);
}
