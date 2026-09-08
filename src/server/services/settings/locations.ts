import type { TenantDb } from "@/server/tenant";
import type { LocationInput } from "./schemas";

/**
 * Pickup and return locations (spec §22).
 *
 * Locations are archived rather than deleted whenever they have been used: a
 * completed reservation must keep pointing at the place the car was actually
 * handed over, or the contract stops matching reality.
 */

export class LocationInUseError extends Error {
  constructor(readonly reservationCount: number) {
    super(
      `This location is used by ${reservationCount} reservation${reservationCount === 1 ? "" : "s"} and cannot be deleted.`,
    );
    this.name = "LocationInUseError";
  }
}

export async function listLocations(db: TenantDb) {
  return db.location.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      address: true,
      pickupFee: true,
      returnFee: true,
      isActive: true,
      sortOrder: true,
      _count: {
        select: { pickupReservations: true, returnReservations: true },
      },
    },
  });
}

export async function createLocation(db: TenantDb, input: LocationInput) {
  const last = await db.location.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return db.location.create({
    data: {
      agencyId: db.$agencyId,
      name: input.name,
      address: input.address,
      pickupFee: input.pickupFee,
      returnFee: input.returnFee,
      isActive: input.isActive,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
}

export async function updateLocation(
  db: TenantDb,
  id: string,
  input: LocationInput,
) {
  return db.location.update({
    where: { id },
    data: {
      name: input.name,
      address: input.address,
      pickupFee: input.pickupFee,
      returnFee: input.returnFee,
      isActive: input.isActive,
    },
    select: { id: true },
  });
}

/**
 * Delete only if the location has never been used; otherwise deactivate, which
 * hides it from new bookings while keeping history intact.
 */
export async function removeLocation(db: TenantDb, id: string) {
  const location = await db.location.findUnique({
    where: { id },
    select: {
      id: true,
      _count: {
        select: { pickupReservations: true, returnReservations: true },
      },
    },
  });
  if (!location) return { deleted: false };

  const used =
    location._count.pickupReservations + location._count.returnReservations;

  if (used > 0) {
    await db.location.update({ where: { id }, data: { isActive: false } });
    return { deleted: false, deactivated: true, used };
  }

  await db.location.delete({ where: { id } });
  return { deleted: true };
}

export async function setDeliverySettings(
  db: TenantDb,
  allowDifferentReturnSite: boolean,
) {
  return db.agencySettings.updateMany({
    data: { allowDifferentReturnSite },
  });
}
