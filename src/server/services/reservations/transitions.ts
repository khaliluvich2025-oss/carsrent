import type { CancellationReason, ReservationStatus } from "@prisma/client";

import type { TenantDb } from "@/server/tenant";

/**
 * The reservation lifecycle (spec §14).
 *
 * The permitted moves are declared here rather than scattered through the UI, so
 * "can this reservation be cancelled?" has one answer that the buttons and the
 * server agree on. A transition the map does not allow is refused server-side
 * even if somebody posts it directly.
 *
 * ACTIVE is reached through the pickup flow and RETURN_INSPECTION/COMPLETED
 * through the return flow, not from this screen — those steps have their own
 * required evidence (mileage, photos, signature) and must not be skippable by a
 * dropdown.
 */
export const ALLOWED_TRANSITIONS: Record<
  ReservationStatus,
  ReservationStatus[]
> = {
  AWAITING_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["READY_FOR_PICKUP", "CANCELLED", "NO_SHOW"],
  READY_FOR_PICKUP: ["ACTIVE", "CONFIRMED", "CANCELLED", "NO_SHOW"],
  ACTIVE: ["RETURN_DUE", "OVERDUE", "RETURN_INSPECTION"],
  RETURN_DUE: ["OVERDUE", "RETURN_INSPECTION", "ACTIVE"],
  OVERDUE: ["RETURN_INSPECTION", "ACTIVE"],
  RETURN_INSPECTION: ["COMPLETED", "ACTIVE"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Statuses in which the vehicle's dates are still held. */
export const BLOCKING_STATUSES: ReservationStatus[] = [
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "RETURN_DUE",
  "OVERDUE",
  "RETURN_INSPECTION",
];

export function canTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ReservationStatus,
    readonly to: ReservationStatus,
  ) {
    super(
      `A reservation cannot move from ${from.replace(/_/g, " ").toLowerCase()} to ${to.replace(/_/g, " ").toLowerCase()}.`,
    );
    this.name = "InvalidTransitionError";
  }
}

async function recordTransition(
  tx: TenantDb,
  agencyId: string,
  reservationId: string,
  from: ReservationStatus,
  to: ReservationStatus,
  userId: string | null,
  reason?: string | null,
) {
  await tx.reservationStatusHistory.create({
    data: {
      agencyId,
      reservationId,
      fromStatus: from,
      toStatus: to,
      reason: reason ?? null,
      changedById: userId,
    },
  });
}

/**
 * Confirm after the phone call (spec §12, §97.5).
 *
 * The dates were already held at creation, so confirming changes status only —
 * there is nothing to re-check and nothing to re-block.
 */
export async function confirmReservation(
  db: TenantDb,
  reservationId: string,
  userId: string,
) {
  const agencyId = db.$agencyId;

  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true },
    });
    if (!reservation) throw new Error("Reservation not found");
    if (!canTransition(reservation.status, "CONFIRMED")) {
      throw new InvalidTransitionError(reservation.status, "CONFIRMED");
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
      select: { id: true, status: true },
    });

    await recordTransition(
      tx as TenantDb,
      agencyId,
      reservationId,
      reservation.status,
      "CONFIRMED",
      userId,
    );

    return updated;
  });
}

/** Mark a confirmed booking ready for the customer to collect. */
export async function markReadyForPickup(
  db: TenantDb,
  reservationId: string,
  userId: string,
) {
  const agencyId = db.$agencyId;

  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true },
    });
    if (!reservation) throw new Error("Reservation not found");
    if (!canTransition(reservation.status, "READY_FOR_PICKUP")) {
      throw new InvalidTransitionError(reservation.status, "READY_FOR_PICKUP");
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "READY_FOR_PICKUP" },
      select: { id: true, status: true },
    });

    await recordTransition(
      tx as TenantDb,
      agencyId,
      reservationId,
      reservation.status,
      "READY_FOR_PICKUP",
      userId,
    );

    return updated;
  });
}

/**
 * Cancel (spec §53).
 *
 * Releasing the dates and changing the status happen together — a cancelled
 * reservation that still holds its block would quietly cost the agency every
 * booking for that period. Payments are deliberately left untouched: they stay
 * in financial history and any refund is a separate, recorded transaction
 * (spec §53, §81).
 */
export async function cancelReservation(
  db: TenantDb,
  reservationId: string,
  userId: string,
  reason: CancellationReason,
  note?: string | null,
) {
  const agencyId = db.$agencyId;

  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true },
    });
    if (!reservation) throw new Error("Reservation not found");
    if (!canTransition(reservation.status, "CANCELLED")) {
      throw new InvalidTransitionError(reservation.status, "CANCELLED");
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancellationNote: note ?? null,
      },
      select: { id: true, status: true },
    });

    // Release the held dates (spec §53, §97).
    await tx.vehicleBlock.deleteMany({ where: { reservationId } });

    await recordTransition(
      tx as TenantDb,
      agencyId,
      reservationId,
      reservation.status,
      "CANCELLED",
      userId,
      note ?? reason,
    );

    return updated;
  });
}

/**
 * No-show (spec §54).
 *
 * The customer never arrived, so the car goes back on the market. Kept distinct
 * from a cancellation because it is a different fact about the customer, and
 * §35's history should be able to tell them apart.
 */
export async function markNoShow(
  db: TenantDb,
  reservationId: string,
  userId: string,
  note?: string | null,
) {
  const agencyId = db.$agencyId;

  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true },
    });
    if (!reservation) throw new Error("Reservation not found");
    if (!canTransition(reservation.status, "NO_SHOW")) {
      throw new InvalidTransitionError(reservation.status, "NO_SHOW");
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "NO_SHOW", cancelledAt: new Date(), cancellationNote: note ?? null },
      select: { id: true, status: true },
    });

    await tx.vehicleBlock.deleteMany({ where: { reservationId } });

    await recordTransition(
      tx as TenantDb,
      agencyId,
      reservationId,
      reservation.status,
      "NO_SHOW",
      userId,
      note,
    );

    return updated;
  });
}

/**
 * Whether the no-show waiting period has elapsed (spec §54).
 *
 * Pure, so the rule is testable without a clock or a database.
 */
export function noShowEligibleAt(
  pickupDatetime: Date,
  waitingMinutes: number,
): Date {
  return new Date(pickupDatetime.getTime() + waitingMinutes * 60_000);
}

export function isNoShowEligible(
  pickupDatetime: Date,
  waitingMinutes: number,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= noShowEligibleAt(pickupDatetime, waitingMinutes).getTime();
}
