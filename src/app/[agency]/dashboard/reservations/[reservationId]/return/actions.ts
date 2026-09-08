"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { wallClockToInstant } from "@/lib/dates";
import {
  fieldErrors,
  moneyString,
  optionalMoneyString,
  optionalText,
  requiredText,
} from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  addAdditionalCharge,
  checkCompletion,
  completeRental,
  confirmReturnDamageCheck,
  getReturnContext,
  recordReturnDamage,
  removeAdditionalCharge,
  ReturnBlockedError,
  saveReturnInspection,
  settleReservationDeposit,
} from "@/server/services/returns/complete";
import {
  PaymentValidationError,
  recordPayment,
} from "@/server/services/payments/record";

export type ReturnState = {
  errors?: Record<string, string>;
  message?: string;
  blockers?: string[];
  saved?: boolean;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

function revalidate(slug: string, reservationId: string) {
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}/return`);
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}`);
  revalidatePath(`/${slug}/dashboard`);
}

async function agencyTimezone(agencyId: string): Promise<string> {
  const agency = await db.agency.findUnique({
    where: { id: agencyId },
    select: { timezone: true },
  });
  return agency?.timezone ?? "Africa/Casablanca";
}

// ---------------------------------------------------------------------------
// Return inspection (spec §43)
// ---------------------------------------------------------------------------

const inspectionSchema = z.object({
  reservationId: z.string().min(1),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the return date"),
  returnTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter the return time"),
  mileage: z.coerce.number().int().min(0, "Cannot be negative").max(2_000_000),
  fuelLevel: z.coerce.number().int().min(0).max(100),
  condition: optionalText,
  notes: optionalText,
});

export async function saveReturnInspectionAction(
  slug: string,
  _prev: ReturnState,
  formData: FormData,
): Promise<ReturnState> {
  const ctx = await requirePermission("inspections.perform");

  const parsed = inspectionSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    returnDate: text(formData, "returnDate"),
    returnTime: text(formData, "returnTime"),
    mileage: text(formData, "mileage"),
    fuelLevel: text(formData, "fuelLevel"),
    condition: text(formData, "condition"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const reservation = await ctx.db.reservation.findUnique({
    where: { id: parsed.data.reservationId },
    select: { id: true, vehicleId: true },
  });
  if (!reservation) return { message: "Reservation not found." };

  const timezone = await agencyTimezone(ctx.user.agencyId);

  await saveReturnInspection(ctx.db, {
    reservationId: parsed.data.reservationId,
    vehicleId: reservation.vehicleId,
    returnedAt: wallClockToInstant(
      parsed.data.returnDate,
      parsed.data.returnTime,
      timezone,
    ),
    mileage: parsed.data.mileage,
    fuelLevel: parsed.data.fuelLevel,
    condition: parsed.data.condition,
    notes: parsed.data.notes,
    userId: ctx.user.userId,
  });

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Damage (spec §47)
// ---------------------------------------------------------------------------

export async function confirmReturnDamageAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("inspections.perform");
  const reservationId = text(formData, "reservationId");
  if (!reservationId) return;

  await confirmReturnDamageCheck(ctx.db, reservationId);
  revalidate(slug, reservationId);
}

const damageSchema = z.object({
  reservationId: z.string().min(1),
  location: requiredText("Where is the damage?", 100),
  damageType: requiredText("What kind of damage?", 60),
  description: optionalText,
  estimatedCharge: optionalMoneyString,
});

export async function addReturnDamageAction(
  slug: string,
  _prev: ReturnState,
  formData: FormData,
): Promise<ReturnState> {
  const ctx = await requirePermission("inspections.perform");

  const parsed = damageSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    location: text(formData, "location"),
    damageType: text(formData, "damageType"),
    description: text(formData, "description"),
    estimatedCharge: text(formData, "estimatedCharge"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const reservation = await ctx.db.reservation.findUnique({
    where: { id: parsed.data.reservationId },
    select: { id: true, vehicleId: true },
  });
  if (!reservation) return { message: "Reservation not found." };

  const inspection = await ctx.db.inspection.findFirst({
    where: { reservationId: parsed.data.reservationId, type: "RETURN" },
    select: { id: true },
  });

  await recordReturnDamage(ctx.db, {
    reservationId: parsed.data.reservationId,
    vehicleId: reservation.vehicleId,
    inspectionId: inspection?.id ?? null,
    location: parsed.data.location,
    damageType: parsed.data.damageType,
    description: parsed.data.description,
    estimatedCharge: parsed.data.estimatedCharge,
    userId: ctx.user.userId,
  });

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Additional charges (spec §48)
// ---------------------------------------------------------------------------

const chargeSchema = z.object({
  reservationId: z.string().min(1),
  type: z.enum(["LATE_RETURN", "EXTRA_MILEAGE", "FUEL", "DAMAGE", "OTHER"]),
  description: optionalText,
  amount: moneyString,
  settleFromDeposit: z.union([z.string(), z.null()]).transform((v) => v === "on"),
});

export async function addChargeAction(
  slug: string,
  _prev: ReturnState,
  formData: FormData,
): Promise<ReturnState> {
  const ctx = await requirePermission("charges.manage");

  const parsed = chargeSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    type: text(formData, "type"),
    description: text(formData, "description"),
    amount: text(formData, "amount"),
    settleFromDeposit: formData.get("settleFromDeposit"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await addAdditionalCharge(ctx.db, {
    reservationId: parsed.data.reservationId,
    type: parsed.data.type,
    description: parsed.data.description,
    amount: parsed.data.amount,
    settleFromDeposit: parsed.data.settleFromDeposit,
    userId: ctx.user.userId,
  });

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

export async function removeChargeAction(
  slug: string,
  reservationId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("charges.manage");
  const chargeId = text(formData, "chargeId");
  if (!chargeId) return;

  await removeAdditionalCharge(
    ctx.db,
    reservationId,
    chargeId,
    ctx.user.userId,
  );
  revalidate(slug, reservationId);
}

// ---------------------------------------------------------------------------
// Money (spec §31, §33)
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  reservationId: z.string().min(1),
  amount: moneyString,
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "OTHER"]),
});

export async function collectBalanceAction(
  slug: string,
  _prev: ReturnState,
  formData: FormData,
): Promise<ReturnState> {
  const ctx = await requirePermission("payments.record");

  const parsed = paymentSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    amount: text(formData, "amount"),
    method: text(formData, "method"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await recordPayment(ctx.db, {
      reservationId: parsed.data.reservationId,
      type: "RENTAL_PAYMENT",
      amount: parsed.data.amount,
      method: parsed.data.method,
      userId: ctx.user.userId,
    });
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return { errors: { [error.field]: error.message } };
    }
    throw error;
  }

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

export async function settleDepositAction(
  slug: string,
  _prev: ReturnState,
  formData: FormData,
): Promise<ReturnState> {
  const ctx = await requirePermission("deposits.manage");
  const reservationId = text(formData, "reservationId");
  if (!reservationId) return { message: "Reservation not found." };

  const settlement = await settleReservationDeposit(
    ctx.db,
    reservationId,
    ctx.user.userId,
  );

  revalidate(slug, reservationId);
  return {
    saved: true,
    message: settlement
      ? `Retained ${settlement.retained}, refunded ${settlement.refund}.`
      : "No deposit was held for this rental.",
  };
}

// ---------------------------------------------------------------------------
// Complete (spec §49)
// ---------------------------------------------------------------------------

export async function completeRentalAction(
  slug: string,
  _prev: ReturnState,
  formData: FormData,
): Promise<ReturnState> {
  const ctx = await requirePermission("returns.perform");
  const reservationId = text(formData, "reservationId");
  if (!reservationId) return { message: "Reservation not found." };

  const reservation = await getReturnContext(ctx.db, reservationId);
  if (!reservation) return { message: "Reservation not found." };

  // Re-checked server-side; the disabled button is only a hint.
  const check = checkCompletion(
    reservation,
    Number(reservation.securityDepositRequired) > 0,
  );

  try {
    await completeRental(ctx.db, reservationId, ctx.user.userId, check);
  } catch (error) {
    if (error instanceof ReturnBlockedError) {
      return { blockers: error.blockers };
    }
    throw error;
  }

  revalidatePath(`/${slug}/dashboard/calendar`);
  revalidate(slug, reservationId);
  redirect(`/${slug}/dashboard/reservations/${reservationId}`);
}
