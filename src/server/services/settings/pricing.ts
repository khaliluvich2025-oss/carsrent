import type { TenantDb } from "@/server/tenant";
import type {
  BillingSettingsInput,
  ExtraInput,
  SeasonalRateInput,
} from "./schemas";

/** Billing, buffer and deposit configuration (spec §21, §27, §28, §54). */
export async function updateBillingSettings(
  db: TenantDb,
  input: BillingSettingsInput,
) {
  return db.agencySettings.updateMany({
    data: {
      billingRule: input.billingRule,
      gracePeriodMinutes: input.gracePeriodMinutes,
      extraHourPrice: input.extraHourPrice,
      bufferMinutes: input.bufferMinutes,
      noShowWaitingMinutes: input.noShowWaitingMinutes,
      securityDepositEnabled: input.securityDepositEnabled,
    },
  });
}

/**
 * Seasonal rates (spec §24).
 *
 * A null `vehicleId` means the whole fleet. Overlapping seasons are allowed and
 * resolved by `priority` at quote time — agencies genuinely need a short peak
 * inside a long high season.
 */
export async function listSeasonalRates(db: TenantDb) {
  return db.seasonalRate.findMany({
    orderBy: [{ startDate: "asc" }, { priority: "desc" }],
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      dailyPrice: true,
      priority: true,
      isActive: true,
      vehicleId: true,
      vehicle: { select: { brand: true, model: true, registrationNumber: true } },
    },
  });
}

export async function createSeasonalRate(
  db: TenantDb,
  input: SeasonalRateInput,
) {
  // A vehicle-specific season must reference a vehicle in this agency; the
  // tenant client scopes the lookup, so a foreign id simply finds nothing.
  if (input.vehicleId) {
    const vehicle = await db.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true },
    });
    if (!vehicle) throw new Error("Vehicle not found");
  }

  return db.seasonalRate.create({
    data: {
      agencyId: db.$agencyId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      dailyPrice: input.dailyPrice,
      priority: input.priority,
      vehicleId: input.vehicleId,
    },
    select: { id: true },
  });
}

export async function deleteSeasonalRate(db: TenantDb, id: string) {
  await db.seasonalRate.deleteMany({ where: { id } });
}

export async function toggleSeasonalRate(
  db: TenantDb,
  id: string,
  isActive: boolean,
) {
  await db.seasonalRate.updateMany({ where: { id }, data: { isActive } });
}

/**
 * Seasons that apply to a given vehicle: fleet-wide ones plus that vehicle's own.
 * This is what the pricing engine is handed at quote time.
 */
export async function getApplicableSeasonalRates(
  db: TenantDb,
  vehicleId: string,
) {
  return db.seasonalRate.findMany({
    where: { isActive: true, OR: [{ vehicleId: null }, { vehicleId }] },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      dailyPrice: true,
      priority: true,
    },
  });
}

/** Optional add-ons (spec §25). */
export async function listExtras(db: TenantDb) {
  return db.extra.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      priceType: true,
      price: true,
      isActive: true,
    },
  });
}

export async function createExtra(db: TenantDb, input: ExtraInput) {
  return db.extra.create({
    data: {
      agencyId: db.$agencyId,
      name: input.name,
      description: input.description,
      priceType: input.priceType,
      price: input.price,
      isActive: input.isActive,
    },
    select: { id: true },
  });
}

export async function deleteExtra(db: TenantDb, id: string) {
  // Extras are snapshotted onto reservations, so removing one from the
  // catalogue never rewrites an existing booking's total.
  await db.extra.deleteMany({ where: { id } });
}

export async function toggleExtra(db: TenantDb, id: string, isActive: boolean) {
  await db.extra.updateMany({ where: { id }, data: { isActive } });
}
