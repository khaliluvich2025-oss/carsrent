"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { fieldErrors, optionalDate, optionalText, requiredText } from "@/lib/validation";
import { moneyString } from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";
import {
  completeHandover,
  confirmDamageCheck,
  getChecklist,
  getHandover,
  HandoverBlockedError,
  recordExistingDamage,
  savePickupInspection,
  saveCustomerDocument,
} from "@/server/services/handover/pickup";
import {
  collectDeposit,
  PaymentValidationError,
  recordPayment,
} from "@/server/services/payments/record";

export type HandoverState = {
  errors?: Record<string, string>;
  message?: string;
  blockers?: string[];
  saved?: boolean;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

function revalidate(slug: string, reservationId: string) {
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}/handover`);
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}`);
}

/** Confirm the vehicle belongs to this agency before any write. */
async function loadReservation(db: Awaited<ReturnType<typeof requirePermission>>["db"], id: string) {
  return db.reservation.findUnique({
    where: { id },
    select: { id: true, vehicleId: true, customerId: true, status: true },
  });
}

// ---------------------------------------------------------------------------
// Documents (spec §36)
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  reservationId: z.string().min(1),
  documentType: z.enum(["DRIVING_LICENCE", "CIN", "PASSPORT", "OTHER"]),
  documentNumber: optionalText,
  expiryDate: optionalDate,
  verified: z.enum(["yes", "no"]),
  rejectionReason: optionalText,
});

export async function saveDocumentAction(
  slug: string,
  _prev: HandoverState,
  formData: FormData,
): Promise<HandoverState> {
  const ctx = await requirePermission("documents.verify");

  const parsed = documentSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    documentType: text(formData, "documentType"),
    documentNumber: text(formData, "documentNumber"),
    expiryDate: text(formData, "expiryDate"),
    verified: text(formData, "verified") || "yes",
    rejectionReason: text(formData, "rejectionReason"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const reservation = await loadReservation(ctx.db, parsed.data.reservationId);
  if (!reservation) return { message: "Reservation not found." };

  await saveCustomerDocument(ctx.db, {
    customerId: reservation.customerId,
    documentType: parsed.data.documentType,
    documentNumber: parsed.data.documentNumber,
    expiryDate: parsed.data.expiryDate,
    verified: parsed.data.verified === "yes",
    rejectionReason: parsed.data.rejectionReason,
  });

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Condition (spec §38)
// ---------------------------------------------------------------------------

const inspectionSchema = z.object({
  reservationId: z.string().min(1),
  mileage: z.coerce.number().int().min(0, "Cannot be negative").max(2_000_000),
  fuelLevel: z.coerce.number().int().min(0).max(100),
  condition: optionalText,
  notes: optionalText,
});

export async function saveInspectionAction(
  slug: string,
  _prev: HandoverState,
  formData: FormData,
): Promise<HandoverState> {
  const ctx = await requirePermission("inspections.perform");

  const parsed = inspectionSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    mileage: text(formData, "mileage"),
    fuelLevel: text(formData, "fuelLevel"),
    condition: text(formData, "condition"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const reservation = await loadReservation(ctx.db, parsed.data.reservationId);
  if (!reservation) return { message: "Reservation not found." };

  await savePickupInspection(ctx.db, {
    reservationId: parsed.data.reservationId,
    vehicleId: reservation.vehicleId,
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
// Damage (spec §39)
// ---------------------------------------------------------------------------

export async function confirmDamageCheckAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("inspections.perform");
  const reservationId = text(formData, "reservationId");
  if (!reservationId) return;

  const reservation = await loadReservation(ctx.db, reservationId);
  if (!reservation) return;

  await confirmDamageCheck(
    ctx.db,
    reservationId,
    reservation.vehicleId,
    ctx.user.userId,
  );
  revalidate(slug, reservationId);
}

const damageSchema = z.object({
  reservationId: z.string().min(1),
  location: requiredText("Where is the damage?", 100),
  damageType: requiredText("What kind of damage?", 60),
  description: optionalText,
});

export async function addDamageAction(
  slug: string,
  _prev: HandoverState,
  formData: FormData,
): Promise<HandoverState> {
  const ctx = await requirePermission("inspections.perform");

  const parsed = damageSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    location: text(formData, "location"),
    damageType: text(formData, "damageType"),
    description: text(formData, "description"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const reservation = await loadReservation(ctx.db, parsed.data.reservationId);
  if (!reservation) return { message: "Reservation not found." };

  const inspection = await ctx.db.inspection.findFirst({
    where: { reservationId: parsed.data.reservationId, type: "PICKUP" },
    select: { id: true },
  });

  await recordExistingDamage(ctx.db, {
    reservationId: parsed.data.reservationId,
    vehicleId: reservation.vehicleId,
    inspectionId: inspection?.id ?? null,
    location: parsed.data.location,
    damageType: parsed.data.damageType,
    description: parsed.data.description,
    userId: ctx.user.userId,
  });

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Money (spec §31, §28)
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  reservationId: z.string().min(1),
  amount: moneyString,
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "OTHER"]),
  transactionReference: optionalText,
});

export async function recordPaymentAction(
  slug: string,
  _prev: HandoverState,
  formData: FormData,
): Promise<HandoverState> {
  const ctx = await requirePermission("payments.record");

  const parsed = paymentSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    amount: text(formData, "amount"),
    method: text(formData, "method"),
    transactionReference: text(formData, "transactionReference"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await recordPayment(ctx.db, {
      reservationId: parsed.data.reservationId,
      type: "RENTAL_PAYMENT",
      amount: parsed.data.amount,
      method: parsed.data.method,
      transactionReference: parsed.data.transactionReference,
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

const depositSchema = z.object({
  reservationId: z.string().min(1),
  amount: moneyString,
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "OTHER"]),
});

export async function collectDepositAction(
  slug: string,
  _prev: HandoverState,
  formData: FormData,
): Promise<HandoverState> {
  const ctx = await requirePermission("deposits.manage");

  const parsed = depositSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    amount: text(formData, "amount"),
    method: text(formData, "method"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await collectDeposit(ctx.db, {
      reservationId: parsed.data.reservationId,
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

// ---------------------------------------------------------------------------
// Complete (spec §41)
// ---------------------------------------------------------------------------

export async function completeHandoverAction(
  slug: string,
  _prev: HandoverState,
  formData: FormData,
): Promise<HandoverState> {
  const ctx = await requirePermission("pickup.perform");
  const reservationId = text(formData, "reservationId");
  if (!reservationId) return { message: "Reservation not found." };

  const reservation = await getHandover(ctx.db, reservationId);
  if (!reservation) return { message: "Reservation not found." };

  // Re-evaluated server-side: the buttons are a convenience, this is the control.
  const checklist = await getChecklist(ctx.db, reservation);

  try {
    await completeHandover(ctx.db, reservationId, ctx.user.userId, checklist);
  } catch (error) {
    if (error instanceof HandoverBlockedError) {
      return { blockers: error.blockers };
    }
    throw error;
  }

  revalidate(slug, reservationId);
  revalidatePath(`/${slug}/dashboard`);
  revalidatePath(`/${slug}/dashboard/calendar`);
  redirect(`/${slug}/dashboard/reservations/${reservationId}`);
}
