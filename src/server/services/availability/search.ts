import type { Prisma } from "@prisma/client";

import { withBuffer } from "@/lib/dates";
import type { TenantDb } from "@/server/tenant";

/**
 * Availability search (spec §19).
 *
 * One question against one table: which vehicles have no blocking row
 * overlapping the requested window? Because `vehicle_blocks` is the single
 * source of occupancy, reservations, maintenance, manual blocks and live
 * payment holds are all covered by the same query — there is no second list to
 * forget about.
 *
 * `vehicles.current_status` is deliberately NOT consulted. A car marked
 * AVAILABLE today may already be booked next week, and one marked RENTED today
 * is free the week after (spec §18, §97.11).
 */

export type AvailabilityWindow = {
  pickupAt: Date;
  returnAt: Date;
  /** Agency turnaround buffer, applied to the end of the requested window. */
  bufferMinutes: number;
};

export type VehicleSearchFilters = {
  category?: string;
  transmission?: "MANUAL" | "AUTOMATIC";
  fuelType?: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | "LPG";
  minSeats?: number;
  /** Inclusive daily-price bounds, as decimal strings */
  maxDailyPrice?: string;
};

/**
 * Vehicle ids that are occupied for any part of the window.
 *
 * Existing blocks already carry their own trailing buffer in `endsAt`, and the
 * requested window is padded at its end here, so a back-to-back booking that
 * respects the turnaround is not reported as a conflict.
 */
export async function findOccupiedVehicleIds(
  db: TenantDb,
  window: AvailabilityWindow,
  options: { excludeReservationId?: string } = {},
): Promise<Set<string>> {
  const blockedUntil = withBuffer(window.returnAt, window.bufferMinutes);
  const now = new Date();

  const blocks = await db.vehicleBlock.findMany({
    where: {
      // requested_start < existing_end AND requested_end > existing_start
      startsAt: { lt: blockedUntil },
      endsAt: { gt: window.pickupAt },
      // An expired checkout hold is not an obstacle (spec §30)
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(options.excludeReservationId
        ? { reservationId: { not: options.excludeReservationId } }
        : {}),
    },
    select: { vehicleId: true },
  });

  return new Set(blocks.map((block) => block.vehicleId));
}

const searchSelect = {
  id: true,
  brand: true,
  model: true,
  year: true,
  category: true,
  transmission: true,
  fuelType: true,
  seats: true,
  doors: true,
  features: true,
  dailyPrice: true,
  weeklyPrice: true,
  monthlyPrice: true,
  securityDeposit: true,
  mileagePolicy: true,
  mileageKmPerDay: true,
  extraKmPrice: true,
  images: {
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
    select: { file: { select: { publicUrl: true } } },
  },
} satisfies Prisma.VehicleSelect;

export type AvailableVehicle = Prisma.VehicleGetPayload<{
  select: typeof searchSelect;
}>;

function buildVehicleWhere(
  filters: VehicleSearchFilters,
): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = { isActive: true };

  if (filters.category) where.category = filters.category;
  if (filters.transmission) where.transmission = filters.transmission;
  if (filters.fuelType) where.fuelType = filters.fuelType;
  if (filters.minSeats) where.seats = { gte: filters.minSeats };
  if (filters.maxDailyPrice) where.dailyPrice = { lte: filters.maxDailyPrice };

  return where;
}

/**
 * Vehicles genuinely available for the requested period (spec §9, §19).
 *
 * This is advisory in the same sense as `hasConflictingBlock`: by the time a
 * customer picks one, somebody else may have taken it. The exclusion constraint
 * on `vehicle_blocks` is what actually decides, at reservation time.
 */
export async function findAvailableVehicles(
  db: TenantDb,
  window: AvailabilityWindow,
  filters: VehicleSearchFilters = {},
): Promise<AvailableVehicle[]> {
  if (window.returnAt.getTime() <= window.pickupAt.getTime()) {
    return [];
  }

  const [candidates, occupied] = await Promise.all([
    db.vehicle.findMany({
      where: buildVehicleWhere(filters),
      select: searchSelect,
      orderBy: [{ dailyPrice: "asc" }, { brand: "asc" }],
    }),
    findOccupiedVehicleIds(db, window),
  ]);

  return candidates.filter((vehicle) => !occupied.has(vehicle.id));
}

/** Whether one specific vehicle is free for a window. */
export async function isVehicleAvailable(
  db: TenantDb,
  vehicleId: string,
  window: AvailabilityWindow,
  options: { excludeReservationId?: string } = {},
): Promise<boolean> {
  const occupied = await findOccupiedVehicleIds(db, window, options);
  return !occupied.has(vehicleId);
}

/**
 * The reservations and maintenance that stand in the way of a window — used to
 * explain a conflict rather than just refuse it (spec §58).
 */
export async function findConflicts(
  db: TenantDb,
  vehicleId: string,
  window: AvailabilityWindow,
) {
  const blockedUntil = withBuffer(window.returnAt, window.bufferMinutes);
  const now = new Date();

  return db.vehicleBlock.findMany({
    where: {
      vehicleId,
      startsAt: { lt: blockedUntil },
      endsAt: { gt: window.pickupAt },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      kind: true,
      startsAt: true,
      endsAt: true,
      reason: true,
      reservation: {
        select: {
          id: true,
          bookingReference: true,
          status: true,
          customer: { select: { fullName: true } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });
}
