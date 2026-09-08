"use server";

import { revalidatePath } from "next/cache";

import { fieldErrors } from "@/lib/validation";
import { requireOwner, requirePermission } from "@/server/auth/guards";
import {
  createLocation,
  removeLocation,
  setDeliverySettings,
  updateLocation,
} from "@/server/services/settings/locations";
import {
  createExtra,
  createSeasonalRate,
  deleteExtra,
  deleteSeasonalRate,
  toggleExtra,
  toggleSeasonalRate,
  updateBillingSettings,
} from "@/server/services/settings/pricing";
import {
  billingSettingsSchema,
  extraSchema,
  locationSchema,
  seasonalRateSchema,
} from "@/server/services/settings/schemas";

export type SettingsFormState = {
  errors?: Record<string, string>;
  saved?: boolean;
  message?: string;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

async function audit(
  ctx: Awaited<ReturnType<typeof requireOwner>>,
  action: string,
  entityType: string,
  entityId: string | null,
  newValue?: unknown,
) {
  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action,
      entityType,
      entityId,
      newValue:
        newValue === undefined
          ? undefined
          : JSON.parse(JSON.stringify(newValue)),
    },
  });
}

// ---------------------------------------------------------------------------
// Locations & delivery (spec §22)
// ---------------------------------------------------------------------------

export async function saveLocationAction(
  agencySlug: string,
  locationId: string | null,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const ctx = await requirePermission("locations.manage");

  const parsed = locationSchema.safeParse({
    name: text(formData, "name"),
    address: text(formData, "address"),
    pickupFee: text(formData, "pickupFee"),
    returnFee: text(formData, "returnFee"),
    isActive: formData.get("isActive"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  if (locationId) {
    await updateLocation(ctx.db, locationId, parsed.data);
    await audit(ctx, "location.update", "Location", locationId, parsed.data);
  } else {
    const created = await createLocation(ctx.db, parsed.data);
    await audit(ctx, "location.create", "Location", created.id, parsed.data);
  }

  revalidatePath(`/${agencySlug}/dashboard/settings/locations`);
  return { saved: true };
}

export async function removeLocationAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("locations.manage");
  const id = text(formData, "locationId");
  if (!id) return;

  const result = await removeLocation(ctx.db, id);
  await audit(
    ctx,
    result.deleted ? "location.delete" : "location.deactivate",
    "Location",
    id,
  );

  revalidatePath(`/${agencySlug}/dashboard/settings/locations`);
}

export async function saveDeliverySettingsAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("settings.manage");
  const allow = formData.get("allowDifferentReturnSite") === "on";

  await setDeliverySettings(ctx.db, allow);
  await audit(ctx, "settings.delivery_update", "AgencySettings", null, {
    allowDifferentReturnSite: allow,
  });

  revalidatePath(`/${agencySlug}/dashboard/settings/locations`);
}

// ---------------------------------------------------------------------------
// Billing rules (spec §21, §27, §28, §54)
// ---------------------------------------------------------------------------

export async function saveBillingSettingsAction(
  agencySlug: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const ctx = await requirePermission("pricing.manage");

  const parsed = billingSettingsSchema.safeParse({
    billingRule: text(formData, "billingRule"),
    gracePeriodMinutes: text(formData, "gracePeriodMinutes"),
    extraHourPrice: text(formData, "extraHourPrice"),
    bufferMinutes: text(formData, "bufferMinutes"),
    noShowWaitingMinutes: text(formData, "noShowWaitingMinutes"),
    securityDepositEnabled: formData.get("securityDepositEnabled"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await updateBillingSettings(ctx.db, parsed.data);
  await audit(ctx, "settings.billing_update", "AgencySettings", null, parsed.data);

  revalidatePath(`/${agencySlug}/dashboard/settings/pricing`);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Seasonal rates (spec §24)
// ---------------------------------------------------------------------------

export async function createSeasonalRateAction(
  agencySlug: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const ctx = await requirePermission("pricing.manage");

  const parsed = seasonalRateSchema.safeParse({
    name: text(formData, "name"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    dailyPrice: text(formData, "dailyPrice"),
    priority: text(formData, "priority") || "0",
    vehicleId: text(formData, "vehicleId"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    const created = await createSeasonalRate(ctx.db, parsed.data);
    await audit(ctx, "pricing.season_create", "SeasonalRate", created.id, {
      name: parsed.data.name,
      dailyPrice: parsed.data.dailyPrice,
    });
  } catch {
    return { errors: { vehicleId: "That vehicle could not be found." } };
  }

  revalidatePath(`/${agencySlug}/dashboard/settings/pricing`);
  return { saved: true };
}

export async function deleteSeasonalRateAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("pricing.manage");
  const id = text(formData, "seasonId");
  if (!id) return;

  await deleteSeasonalRate(ctx.db, id);
  await audit(ctx, "pricing.season_delete", "SeasonalRate", id);
  revalidatePath(`/${agencySlug}/dashboard/settings/pricing`);
}

export async function toggleSeasonalRateAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("pricing.manage");
  const id = text(formData, "seasonId");
  if (!id) return;

  await toggleSeasonalRate(ctx.db, id, text(formData, "isActive") === "1");
  revalidatePath(`/${agencySlug}/dashboard/settings/pricing`);
}

// ---------------------------------------------------------------------------
// Extras (spec §25)
// ---------------------------------------------------------------------------

export async function createExtraAction(
  agencySlug: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const ctx = await requirePermission("pricing.manage");

  const parsed = extraSchema.safeParse({
    name: text(formData, "name"),
    description: text(formData, "description"),
    priceType: text(formData, "priceType"),
    price: text(formData, "price"),
    isActive: formData.get("isActive"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const created = await createExtra(ctx.db, parsed.data);
  await audit(ctx, "pricing.extra_create", "Extra", created.id, parsed.data);

  revalidatePath(`/${agencySlug}/dashboard/settings/pricing`);
  return { saved: true };
}

export async function deleteExtraAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("pricing.manage");
  const id = text(formData, "extraId");
  if (!id) return;

  await deleteExtra(ctx.db, id);
  await audit(ctx, "pricing.extra_delete", "Extra", id);
  revalidatePath(`/${agencySlug}/dashboard/settings/pricing`);
}

export async function toggleExtraAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("pricing.manage");
  const id = text(formData, "extraId");
  if (!id) return;

  await toggleExtra(ctx.db, id, text(formData, "isActive") === "1");
  revalidatePath(`/${agencySlug}/dashboard/settings/pricing`);
}
