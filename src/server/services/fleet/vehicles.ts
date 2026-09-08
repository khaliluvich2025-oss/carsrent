import type { Prisma, VehicleStatus } from "@prisma/client";

import type { TenantDb } from "@/server/tenant";
import type { FleetFilters, VehicleInput } from "./schemas";

/**
 * Fleet queries and mutations (spec §16, §17, §18).
 *
 * Everything here goes through the tenant-scoped client, so no query in this
 * file needs to mention `agencyId` — it is injected, and cannot be omitted.
 */

export class DuplicateRegistrationError extends Error {
  constructor(readonly registrationNumber: string) {
    super(`A vehicle with registration ${registrationNumber} already exists.`);
    this.name = "DuplicateRegistrationError";
  }
}

const listSelect = {
  id: true,
  brand: true,
  model: true,
  year: true,
  category: true,
  transmission: true,
  fuelType: true,
  seats: true,
  doors: true,
  currentMileage: true,
  dailyPrice: true,
  securityDeposit: true,
  currentStatus: true,
  isActive: true,
  registrationNumber: true,
  insuranceExpiryAt: true,
  technicalInspectionExpiryAt: true,
  images: {
    where: { isCover: true },
    take: 1,
    select: { file: { select: { publicUrl: true } } },
  },
} satisfies Prisma.VehicleSelect;

export type FleetListItem = Prisma.VehicleGetPayload<{
  select: typeof listSelect;
}>;

function buildWhere(filters: FleetFilters): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = {
    isActive: filters.archived === "1" ? false : true,
  };

  if (filters.status) where.currentStatus = filters.status;
  if (filters.category) where.category = filters.category;
  if (filters.transmission) where.transmission = filters.transmission;
  if (filters.fuelType) where.fuelType = filters.fuelType;

  if (filters.q) {
    const q = filters.q;
    where.OR = [
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { registrationNumber: { contains: q, mode: "insensitive" } },
      { color: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function listVehicles(
  db: TenantDb,
  filters: FleetFilters,
): Promise<FleetListItem[]> {
  return db.vehicle.findMany({
    where: buildWhere(filters),
    select: listSelect,
    orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
  });
}

/** Counts for the filter chips, computed over the same base scope. */
export async function countVehiclesByStatus(
  db: TenantDb,
): Promise<{ total: number; byStatus: Record<VehicleStatus, number> }> {
  const rows = await db.vehicle.groupBy({
    by: ["currentStatus"],
    where: { isActive: true },
    _count: { _all: true },
  });

  const byStatus = {
    AVAILABLE: 0,
    RESERVED: 0,
    RENTED: 0,
    MAINTENANCE: 0,
    UNAVAILABLE: 0,
  } as Record<VehicleStatus, number>;

  let total = 0;
  for (const row of rows) {
    byStatus[row.currentStatus] = row._count._all;
    total += row._count._all;
  }

  return { total, byStatus };
}

/** Distinct categories in use, for the filter dropdown. */
export async function listCategories(db: TenantDb): Promise<string[]> {
  const rows = await db.vehicle.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}

export async function getVehicle(db: TenantDb, id: string) {
  return db.vehicle.findUnique({
    where: { id },
    include: {
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        include: { file: { select: { id: true, publicUrl: true } } },
      },
    },
  });
}

function toWriteData(input: VehicleInput) {
  return {
    brand: input.brand,
    model: input.model,
    year: input.year,
    category: input.category,
    transmission: input.transmission,
    fuelType: input.fuelType,
    seats: input.seats,
    doors: input.doors,
    color: input.color,
    features: input.features,
    registrationNumber: input.registrationNumber.toUpperCase(),
    vin: input.vin,
    currentMileage: input.currentMileage,
    dailyPrice: input.dailyPrice,
    weeklyPrice: input.weeklyPrice,
    monthlyPrice: input.monthlyPrice,
    securityDeposit: input.securityDeposit,
    mileagePolicy: input.mileagePolicy === "" ? null : input.mileagePolicy,
    mileageKmPerDay: input.mileageKmPerDay,
    extraKmPrice: input.extraKmPrice,
    currentStatus: input.currentStatus,
    isActive: input.isActive,
    insuranceExpiryAt: input.insuranceExpiryAt,
    technicalInspectionExpiryAt: input.technicalInspectionExpiryAt,
    nextServiceMileage: input.nextServiceMileage,
  };
}

/** Registration is unique per agency, so surface the clash as a field error. */
function isUniqueRegistrationViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== "P2002") return false;
  const target = e.meta?.target;
  return (
    (Array.isArray(target) && target.includes("registrationNumber")) ||
    (typeof target === "string" && target.includes("registrationNumber"))
  );
}

export async function createVehicle(db: TenantDb, input: VehicleInput) {
  try {
    return await db.vehicle.create({
      data: { agencyId: db.$agencyId, ...toWriteData(input) },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueRegistrationViolation(error)) {
      throw new DuplicateRegistrationError(input.registrationNumber);
    }
    throw error;
  }
}

export async function updateVehicle(
  db: TenantDb,
  id: string,
  input: VehicleInput,
) {
  try {
    return await db.vehicle.update({
      where: { id },
      data: toWriteData(input),
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueRegistrationViolation(error)) {
      throw new DuplicateRegistrationError(input.registrationNumber);
    }
    throw error;
  }
}

/**
 * Set the operational display status (spec §18).
 *
 * This does NOT affect whether the vehicle can be booked — availability is
 * always computed from `vehicle_blocks` (spec §97.11). To actually stop bookings
 * for a period, create a MANUAL or MAINTENANCE block.
 */
export async function setVehicleStatus(
  db: TenantDb,
  id: string,
  status: VehicleStatus,
) {
  return db.vehicle.update({
    where: { id },
    data: { currentStatus: status },
    select: { id: true, currentStatus: true },
  });
}

/**
 * Archive rather than delete, so historical reservations, contracts and
 * financial records keep pointing at a real vehicle (spec §6's principle,
 * applied to the fleet).
 */
export async function setVehicleArchived(
  db: TenantDb,
  id: string,
  archived: boolean,
) {
  return db.vehicle.update({
    where: { id },
    data: {
      isActive: !archived,
      ...(archived ? { currentStatus: "UNAVAILABLE" as const } : {}),
    },
    select: { id: true, isActive: true },
  });
}
