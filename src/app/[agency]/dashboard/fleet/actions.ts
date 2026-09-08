"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { fieldErrors } from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";
import {
  createVehicle,
  DuplicateRegistrationError,
  setVehicleArchived,
  setVehicleStatus,
  updateVehicle,
} from "@/server/services/fleet/vehicles";
import { vehicleInputSchema, VEHICLE_STATUSES } from "@/server/services/fleet/schemas";

export type VehicleFormState = {
  errors?: Record<string, string>;
  message?: string;
};

function readForm(formData: FormData) {
  const value = (name: string) => (formData.get(name) ?? "").toString();
  return {
    brand: value("brand"),
    model: value("model"),
    year: value("year"),
    category: value("category"),
    transmission: value("transmission"),
    fuelType: value("fuelType"),
    seats: value("seats"),
    doors: value("doors"),
    color: value("color"),
    features: value("features"),
    registrationNumber: value("registrationNumber"),
    vin: value("vin"),
    currentMileage: value("currentMileage"),
    dailyPrice: value("dailyPrice"),
    weeklyPrice: value("weeklyPrice"),
    monthlyPrice: value("monthlyPrice"),
    securityDeposit: value("securityDeposit"),
    mileagePolicy: value("mileagePolicy"),
    mileageKmPerDay: value("mileageKmPerDay"),
    extraKmPrice: value("extraKmPrice"),
    currentStatus: value("currentStatus"),
    isActive: formData.get("isActive"),
  };
}

async function auditVehicleChange(
  ctx: Awaited<ReturnType<typeof requirePermission>>,
  action: string,
  entityId: string,
  newValue?: unknown,
) {
  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action,
      entityType: "Vehicle",
      entityId,
      newValue: newValue === undefined ? undefined : JSON.parse(JSON.stringify(newValue)),
    },
  });
}

export async function createVehicleAction(
  agencySlug: string,
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const ctx = await requirePermission("fleet.manage");

  const parsed = vehicleInputSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  let vehicleId: string;
  try {
    const created = await createVehicle(ctx.db, parsed.data);
    vehicleId = created.id;
  } catch (error) {
    if (error instanceof DuplicateRegistrationError) {
      return { errors: { registrationNumber: error.message } };
    }
    throw error;
  }

  await auditVehicleChange(ctx, "vehicle.create", vehicleId, {
    registrationNumber: parsed.data.registrationNumber,
    brand: parsed.data.brand,
    model: parsed.data.model,
  });

  revalidatePath(`/${agencySlug}/dashboard/fleet`);
  redirect(`/${agencySlug}/dashboard/fleet/${vehicleId}`);
}

export async function updateVehicleAction(
  agencySlug: string,
  vehicleId: string,
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const ctx = await requirePermission("fleet.manage");

  const parsed = vehicleInputSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  try {
    await updateVehicle(ctx.db, vehicleId, parsed.data);
  } catch (error) {
    if (error instanceof DuplicateRegistrationError) {
      return { errors: { registrationNumber: error.message } };
    }
    throw error;
  }

  await auditVehicleChange(ctx, "vehicle.update", vehicleId, {
    registrationNumber: parsed.data.registrationNumber,
    dailyPrice: parsed.data.dailyPrice,
    securityDeposit: parsed.data.securityDeposit,
  });

  revalidatePath(`/${agencySlug}/dashboard/fleet`);
  revalidatePath(`/${agencySlug}/dashboard/fleet/${vehicleId}`);
  redirect(`/${agencySlug}/dashboard/fleet/${vehicleId}`);
}

const statusSchema = z.object({
  vehicleId: z.string().min(1),
  status: z.enum(VEHICLE_STATUSES),
});

export async function setVehicleStatusAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("fleet.manage");

  const parsed = statusSchema.safeParse({
    vehicleId: formData.get("vehicleId")?.toString(),
    status: formData.get("status")?.toString(),
  });
  if (!parsed.success) return;

  await setVehicleStatus(ctx.db, parsed.data.vehicleId, parsed.data.status);

  // Manual status changes are audited (spec §80).
  await auditVehicleChange(ctx, "vehicle.status_change", parsed.data.vehicleId, {
    status: parsed.data.status,
  });

  revalidatePath(`/${agencySlug}/dashboard/fleet`);
  revalidatePath(`/${agencySlug}/dashboard/fleet/${parsed.data.vehicleId}`);
}

export async function setVehicleArchivedAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("fleet.manage");

  const vehicleId = formData.get("vehicleId")?.toString();
  const archived = formData.get("archived")?.toString() === "1";
  if (!vehicleId) return;

  await setVehicleArchived(ctx.db, vehicleId, archived);
  await auditVehicleChange(
    ctx,
    archived ? "vehicle.archive" : "vehicle.restore",
    vehicleId,
  );

  revalidatePath(`/${agencySlug}/dashboard/fleet`);
  revalidatePath(`/${agencySlug}/dashboard/fleet/${vehicleId}`);
}
