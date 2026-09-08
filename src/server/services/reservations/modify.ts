import { withBuffer } from "@/lib/dates";
import { clampAtZero, money, subtract, toDecimal } from "@/lib/money";
import { rethrowAsAvailabilityError } from "@/server/services/availability/errors";
import { findConflicts } from "@/server/services/availability/search";
import {
  loadQuoteContext,
  quoteFromContext,
} from "@/server/services/booking/create";
import type { TenantDb } from "@/server/tenant";
import { BLOCKING_STATUSES } from "./transitions";

/**
 * Modifying and extending a live reservation (spec §55, §56).
 *
 * Both re-run the availability check before saving, both recalculate the price,
 * and both append to the change history rather than overwriting it. The rule
 * they share: a change that cannot be honoured is refused with the conflicting
 * bookings named, never silently accepted.
 */

export class ReservationConflictError extends Error {
  constructor(readonly conflicts: string[]) {
    super("The vehicle is not available for the requested period.");
    this.name = "ReservationConflictError";
  }
}

export class ModificationNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModificationNotAllowedError";
  }
}

export type ModifyInput = {
  vehicleId: string;
  pickupLocationId: string;
  returnLocationId: string;
  pickupAt: Date;
  returnAt: Date;
  reason?: string | null;
};

const MODIFIABLE_STATUSES = [
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "READY_FOR_PICKUP",
] as const;

/**
 * Change dates, vehicle or locations (spec §55).
 *
 * The old block is deleted and the new one inserted inside one transaction, so
 * the reservation never briefly holds two windows — and never holds none. The
 * exclusion constraint still guards the insert, which is what makes the
 * re-check safe against a booking that lands in between.
 */
export async function modifyReservation(
  db: TenantDb,
  reservationId: string,
  input: ModifyInput,
  userId: string,
) {
  const agencyId = db.$agencyId;

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      pickupLocationId: true,
      returnLocationId: true,
      pickupDatetime: true,
      returnDatetime: true,
      calculatedTotal: true,
      manualOverrideAmount: true,
      finalTotal: true,
      amountPaid: true,
      currency: true,
    },
  });
  if (!reservation) throw new Error("Reservation not found");

  if (!MODIFIABLE_STATUSES.includes(reservation.status as never)) {
    throw new ModificationNotAllowedError(
      "Only reservations that have not started can be modified. Use Extend for a rental in progress.",
    );
  }

  const context = await loadQuoteContext(db, {
    vehicleId: input.vehicleId,
    pickupLocationId: input.pickupLocationId,
    returnLocationId: input.returnLocationId,
    pickupAt: input.pickupAt,
  });

  const bufferMinutes = context.settings?.bufferMinutes ?? 0;

  // Explain the clash rather than just refusing it (spec §55).
  const conflicts = await findConflicts(db, input.vehicleId, {
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
    bufferMinutes,
  });
  const blocking = conflicts.filter(
    (conflict) => conflict.reservation?.id !== reservationId,
  );
  if (blocking.length > 0) {
    throw new ReservationConflictError(
      blocking.map((conflict) =>
        conflict.reservation
          ? `${conflict.reservation.bookingReference} · ${conflict.reservation.customer.fullName}`
          : conflict.kind === "MAINTENANCE"
            ? "Scheduled maintenance"
            : "A manual block",
      ),
    );
  }

  const quote = quoteFromContext(context, {
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
  });

  // A manual override is a negotiated figure for a specific rental. When the
  // rental itself changes, the override no longer describes anything, so it is
  // dropped and the recalculated price applies (spec §26).
  const finalTotal = quote.total;

  try {
    return await db.$transaction(async (tx) => {
      await tx.vehicleBlock.deleteMany({ where: { reservationId } });

      await tx.vehicleBlock.create({
        data: {
          agencyId,
          vehicleId: input.vehicleId,
          kind: "RESERVATION",
          startsAt: input.pickupAt,
          endsAt: withBuffer(input.returnAt, bufferMinutes),
          bufferMinutes,
          reservationId,
          createdById: userId,
        },
      });

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          vehicleId: input.vehicleId,
          pickupLocationId: input.pickupLocationId,
          returnLocationId: input.returnLocationId,
          pickupDatetime: input.pickupAt,
          returnDatetime: input.returnAt,
          rentalDays: quote.duration.billableDays,
          baseAmount: quote.baseAmount,
          pickupFee: quote.pickupFee,
          returnFee: quote.returnFee,
          extrasAmount: quote.extrasAmount,
          discountAmount: quote.discountAmount,
          calculatedTotal: quote.total,
          manualOverrideAmount: null,
          finalTotal,
          amountRemaining: clampAtZero(
            subtract(finalTotal, reservation.amountPaid),
          ).toFixed(2),
          securityDepositRequired: quote.securityDeposit,
          pricingBreakdown: JSON.parse(JSON.stringify(quote.lines)),
        },
        select: { id: true, bookingReference: true },
      });

      await tx.reservationChange.create({
        data: {
          agencyId,
          reservationId,
          changeType: "MODIFICATION",
          oldValues: {
            vehicleId: reservation.vehicleId,
            pickupLocationId: reservation.pickupLocationId,
            returnLocationId: reservation.returnLocationId,
            pickupDatetime: reservation.pickupDatetime.toISOString(),
            returnDatetime: reservation.returnDatetime.toISOString(),
            finalTotal: reservation.finalTotal.toString(),
          },
          newValues: {
            vehicleId: input.vehicleId,
            pickupLocationId: input.pickupLocationId,
            returnLocationId: input.returnLocationId,
            pickupDatetime: input.pickupAt.toISOString(),
            returnDatetime: input.returnAt.toISOString(),
            finalTotal,
          },
          priceDelta: subtract(finalTotal, reservation.finalTotal).toFixed(2),
          reason: input.reason ?? null,
          changedById: userId,
        },
      });

      return updated;
    });
  } catch (error) {
    rethrowAsAvailabilityError(error);
  }
}

/**
 * Extend a rental in progress (spec §56).
 *
 * Only the return time moves. Everything else — vehicle, locations, the rate
 * that was quoted — stays as it was, and the customer is charged the difference.
 */
export async function extendReservation(
  db: TenantDb,
  reservationId: string,
  newReturnAt: Date,
  userId: string,
  reason?: string | null,
) {
  const agencyId = db.$agencyId;

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      pickupLocationId: true,
      returnLocationId: true,
      pickupDatetime: true,
      returnDatetime: true,
      finalTotal: true,
      amountPaid: true,
      manualOverrideAmount: true,
    },
  });
  if (!reservation) throw new Error("Reservation not found");

  if (!BLOCKING_STATUSES.includes(reservation.status)) {
    throw new ModificationNotAllowedError(
      "This reservation is closed and cannot be extended.",
    );
  }
  if (newReturnAt.getTime() <= reservation.returnDatetime.getTime()) {
    throw new ModificationNotAllowedError(
      "The new return time must be later than the current one.",
    );
  }

  const context = await loadQuoteContext(db, {
    vehicleId: reservation.vehicleId,
    pickupLocationId: reservation.pickupLocationId,
    returnLocationId: reservation.returnLocationId,
    pickupAt: reservation.pickupDatetime,
  });
  const bufferMinutes = context.settings?.bufferMinutes ?? 0;

  // Only the newly requested tail needs checking; the existing window is
  // already this reservation's own block.
  const conflicts = await findConflicts(db, reservation.vehicleId, {
    pickupAt: reservation.returnDatetime,
    returnAt: newReturnAt,
    bufferMinutes,
  });
  const blocking = conflicts.filter(
    (conflict) => conflict.reservation?.id !== reservationId,
  );
  if (blocking.length > 0) {
    throw new ReservationConflictError(
      blocking.map((conflict) =>
        conflict.reservation
          ? `${conflict.reservation.bookingReference} · ${conflict.reservation.customer.fullName}`
          : conflict.kind === "MAINTENANCE"
            ? "Scheduled maintenance"
            : "A manual block",
      ),
    );
  }

  const quote = quoteFromContext(context, {
    pickupAt: reservation.pickupDatetime,
    returnAt: newReturnAt,
  });

  const additional = subtract(quote.total, reservation.finalTotal);

  try {
    return await db.$transaction(async (tx) => {
      await tx.vehicleBlock.deleteMany({ where: { reservationId } });
      await tx.vehicleBlock.create({
        data: {
          agencyId,
          vehicleId: reservation.vehicleId,
          kind: "RESERVATION",
          startsAt: reservation.pickupDatetime,
          endsAt: withBuffer(newReturnAt, bufferMinutes),
          bufferMinutes,
          reservationId,
          createdById: userId,
        },
      });

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          returnDatetime: newReturnAt,
          rentalDays: quote.duration.billableDays,
          baseAmount: quote.baseAmount,
          calculatedTotal: quote.total,
          manualOverrideAmount: null,
          finalTotal: quote.total,
          amountRemaining: clampAtZero(
            subtract(quote.total, reservation.amountPaid),
          ).toFixed(2),
          pricingBreakdown: JSON.parse(JSON.stringify(quote.lines)),
        },
        select: { id: true },
      });

      await tx.reservationChange.create({
        data: {
          agencyId,
          reservationId,
          changeType: "EXTENSION",
          oldValues: {
            returnDatetime: reservation.returnDatetime.toISOString(),
            finalTotal: reservation.finalTotal.toString(),
          },
          newValues: {
            returnDatetime: newReturnAt.toISOString(),
            finalTotal: quote.total,
          },
          priceDelta: additional.toFixed(2),
          reason: reason ?? null,
          changedById: userId,
        },
      });

      return { ...updated, additionalAmount: additional.toFixed(2) };
    });
  } catch (error) {
    rethrowAsAvailabilityError(error);
  }
}

/**
 * Manual price override (spec §26).
 *
 * `calculatedTotal` is never touched. The negotiated figure lives alongside it
 * with who set it, when, and why — so the original price survives the
 * negotiation and the change is answerable later (spec §26, §80).
 */
export async function overrideReservationPrice(
  db: TenantDb,
  reservationId: string,
  newTotal: string,
  reason: string,
  userId: string,
) {
  const agencyId = db.$agencyId;

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      calculatedTotal: true,
      finalTotal: true,
      amountPaid: true,
    },
  });
  if (!reservation) throw new Error("Reservation not found");
  if (reservation.status === "CANCELLED" || reservation.status === "COMPLETED") {
    throw new ModificationNotAllowedError(
      "A closed reservation's price cannot be changed.",
    );
  }

  const override = money(newTotal);
  if (toDecimal(override).isNegative()) {
    throw new ModificationNotAllowedError("The price cannot be negative.");
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        manualOverrideAmount: override.toFixed(2),
        finalTotal: override.toFixed(2),
        amountRemaining: clampAtZero(
          subtract(override, reservation.amountPaid),
        ).toFixed(2),
      },
      select: { id: true },
    });

    await tx.reservationChange.create({
      data: {
        agencyId,
        reservationId,
        changeType: "PRICE_OVERRIDE",
        oldValues: {
          calculatedTotal: reservation.calculatedTotal.toString(),
          finalTotal: reservation.finalTotal.toString(),
        },
        newValues: { finalTotal: override.toFixed(2) },
        priceDelta: subtract(override, reservation.finalTotal).toFixed(2),
        reason,
        changedById: userId,
      },
    });

    await tx.auditLog.create({
      data: {
        agencyId,
        userId,
        action: "reservation.price_override",
        entityType: "Reservation",
        entityId: reservationId,
        oldValue: { finalTotal: reservation.finalTotal.toString() },
        newValue: { finalTotal: override.toFixed(2) },
        reason,
      },
    });

    return updated;
  });
}
