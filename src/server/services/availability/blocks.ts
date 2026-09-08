import type { VehicleBlockKind } from "@prisma/client";

import { withBuffer } from "@/lib/dates";
import type { TenantDb } from "@/server/tenant";
import { rethrowAsAvailabilityError } from "./errors";

/**
 * Writing to `vehicle_blocks`, the single source of vehicle occupancy
 * (docs/ARCHITECTURE.md §4).
 *
 * Two layers, and they do different jobs:
 *
 *   `hasConflictingBlock` is the *friendly* check (spec §20 checks #1 and #2).
 *   It answers fast and lets the UI show alternatives, but it is advisory — by
 *   the time it returns, another request may already have taken the slot.
 *
 *   `createVehicleBlock` is the *guarantee*. The exclusion constraint decides,
 *   and a lost race comes back as `VehicleUnavailableError`.
 *
 * Never treat the first as sufficient. That is exactly the mistake spec §20
 * warns about ("do not rely only on frontend checks").
 */

export type CreateBlockInput = {
  vehicleId: string;
  kind: VehicleBlockKind;
  startsAt: Date;
  /** The real end of the window, BEFORE the turnaround buffer is applied. */
  endsAt: Date;
  /** Trailing turnaround allowance (spec §21). Folded into the stored `endsAt`. */
  bufferMinutes?: number;
  /** PAYMENT_HOLD only — when this hold stops blocking (spec §30). */
  expiresAt?: Date | null;
  reservationId?: string | null;
  maintenanceBlockId?: string | null;
  reason?: string | null;
  createdById?: string | null;
};

export type ConflictQuery = {
  vehicleId: string;
  startsAt: Date;
  endsAt: Date;
  bufferMinutes?: number;
  /** Ignore one block — used when modifying or extending its own reservation. */
  excludeBlockId?: string;
};

/**
 * Advisory availability check.
 *
 * Mirrors spec §19's overlap rule, with the requested window padded by the
 * buffer at its end. Expired payment holds are ignored rather than deleted here,
 * so a read never mutates.
 */
export async function hasConflictingBlock(
  db: TenantDb,
  query: ConflictQuery,
): Promise<boolean> {
  const blockedUntil = withBuffer(query.endsAt, query.bufferMinutes ?? 0);
  const now = new Date();

  const conflict = await db.vehicleBlock.findFirst({
    where: {
      vehicleId: query.vehicleId,
      ...(query.excludeBlockId ? { id: { not: query.excludeBlockId } } : {}),
      // requested_start < existing_end AND requested_end > existing_start
      startsAt: { lt: blockedUntil },
      endsAt: { gt: query.startsAt },
      // An expired hold is not an obstacle (spec §30)
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  });

  return conflict !== null;
}

/**
 * Claim a window for a vehicle.
 *
 * Expired payment holds are swept inside the same transaction as the insert.
 * That matters: the exclusion constraint has no notion of time passing, so an
 * expired hold left in the table would keep blocking forever. Doing it here,
 * transactionally, means an abandoned checkout never permanently costs the
 * agency a booking, without putting a background job on the critical path.
 *
 * @throws {VehicleUnavailableError} when the window is already taken.
 */
export async function createVehicleBlock(db: TenantDb, input: CreateBlockInput) {
  const bufferMinutes = input.bufferMinutes ?? 0;
  const blockedUntil = withBuffer(input.endsAt, bufferMinutes);

  try {
    return await db.$transaction(async (tx) => {
      await tx.vehicleBlock.deleteMany({
        where: {
          vehicleId: input.vehicleId,
          kind: "PAYMENT_HOLD",
          expiresAt: { lte: new Date() },
        },
      });

      return tx.vehicleBlock.create({
        data: {
          agencyId: db.$agencyId,
          vehicleId: input.vehicleId,
          kind: input.kind,
          startsAt: input.startsAt,
          endsAt: blockedUntil,
          bufferMinutes,
          expiresAt: input.expiresAt ?? null,
          reservationId: input.reservationId ?? null,
          maintenanceBlockId: input.maintenanceBlockId ?? null,
          reason: input.reason ?? null,
          createdById: input.createdById ?? null,
        },
      });
    });
  } catch (error) {
    rethrowAsAvailabilityError(error);
  }
}
