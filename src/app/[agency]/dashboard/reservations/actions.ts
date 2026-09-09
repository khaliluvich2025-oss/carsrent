"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wallClockToInstant } from "@/lib/dates";
import { fieldErrors } from "@/lib/validation";
import { moneyString } from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { VehicleUnavailableError } from "@/server/services/availability/errors";
import {
  extendReservation,
  ModificationNotAllowedError,
  modifyReservation,
  overrideReservationPrice,
  ReservationConflictError,
} from "@/server/services/reservations/modify";
import {
  cancelReservation,
  confirmReservation,
  InvalidTransitionError,
  markNoShow,
  markReadyForPickup,
} from "@/server/services/reservations/transitions";

export type ReservationActionState = {
  errors?: Record<string, string>;
  conflicts?: string[];
  message?: string;
  saved?: boolean;
};

const text = (formData: FormData, name: string) =>
  (formData.get(name) ?? "").toString();

async function agencyTimezone(agencyId: string): Promise<string> {
  const agency = await db.agency.findUnique({
    where: { id: agencyId },
    select: { timezone: true },
  });
  return agency?.timezone ?? "Africa/Casablanca";
}

function revalidate(slug: string, reservationId: string) {
  revalidatePath(`/${slug}/dashboard/reservations`);
  revalidatePath(`/${slug}/dashboard/reservations/${reservationId}`);
  revalidatePath(`/${slug}/dashboard/calendar`);
  revalidatePath(`/${slug}/dashboard`);
}

// ---------------------------------------------------------------------------
// Status transitions (spec §12, §53, §54)
// ---------------------------------------------------------------------------

export async function confirmReservationAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("reservations.manage");
  const id = text(formData, "reservationId");
  if (!id) return;

  try {
    await confirmReservation(ctx.db, id, ctx.user.userId);
  } catch (error) {
    // Double-submitting Confirm is the common case here: the reservation is
    // already where the click was trying to move it, so revalidate and let the
    // page redraw rather than showing an error for work already done.
    if (error instanceof InvalidTransitionError) {
      revalidate(slug, id);
      return;
    }
    throw error;
  }

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: "reservation.confirm",
      entityType: "Reservation",
      entityId: id,
    },
  });

  revalidate(slug, id);
}

export async function markReadyAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("reservations.manage");
  const id = text(formData, "reservationId");
  if (!id) return;

  try {
    await markReadyForPickup(ctx.db, id, ctx.user.userId);
  } catch (error) {
    if (!(error instanceof InvalidTransitionError)) throw error;
  }

  revalidate(slug, id);
}

const cancelSchema = z.object({
  reservationId: z.string().min(1),
  reason: z.enum([
    "CUSTOMER_REQUEST",
    "PAYMENT_ISSUE",
    "AGENCY_DECISION",
    "OTHER",
  ]),
  note: z.string().trim().max(300),
});

export async function cancelReservationAction(
  slug: string,
  _prev: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  const ctx = await requirePermission("reservations.cancel");

  const parsed = cancelSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    reason: text(formData, "reason"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await cancelReservation(
      ctx.db,
      parsed.data.reservationId,
      ctx.user.userId,
      parsed.data.reason,
      parsed.data.note || null,
    );
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      return { message: error.message };
    }
    throw error;
  }

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: "reservation.cancel",
      entityType: "Reservation",
      entityId: parsed.data.reservationId,
      reason: parsed.data.note || parsed.data.reason,
    },
  });

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

export async function markNoShowAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("reservations.manage");
  const id = text(formData, "reservationId");
  if (!id) return;

  try {
    await markNoShow(ctx.db, id, ctx.user.userId, text(formData, "note") || null);
  } catch (error) {
    if (error instanceof InvalidTransitionError) return;
    throw error;
  }

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: "reservation.no_show",
      entityType: "Reservation",
      entityId: id,
    },
  });

  revalidate(slug, id);
}

// ---------------------------------------------------------------------------
// Modify (spec §55)
// ---------------------------------------------------------------------------

const modifySchema = z
  .object({
    reservationId: z.string().min(1),
    vehicleId: z.string().min(1, "Choose a vehicle"),
    pickupLocationId: z.string().min(1, "Choose a pickup location"),
    returnLocationId: z.string().min(1, "Choose a return location"),
    pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a pickup date"),
    pickupTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a pickup time"),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a return date"),
    returnTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a return time"),
    reason: z.string().trim().max(300),
  })
  .superRefine((value, ctx) => {
    if (
      `${value.returnDate}T${value.returnTime}` <=
      `${value.pickupDate}T${value.pickupTime}`
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "The return must be after the pickup",
      });
    }
  });

export async function modifyReservationAction(
  slug: string,
  _prev: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  const ctx = await requirePermission("reservations.manage");

  const parsed = modifySchema.safeParse({
    reservationId: text(formData, "reservationId"),
    vehicleId: text(formData, "vehicleId"),
    pickupLocationId: text(formData, "pickupLocationId"),
    returnLocationId: text(formData, "returnLocationId"),
    pickupDate: text(formData, "pickupDate"),
    pickupTime: text(formData, "pickupTime"),
    returnDate: text(formData, "returnDate"),
    returnTime: text(formData, "returnTime"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const timezone = await agencyTimezone(ctx.user.agencyId);

  try {
    await modifyReservation(
      ctx.db,
      parsed.data.reservationId,
      {
        vehicleId: parsed.data.vehicleId,
        pickupLocationId: parsed.data.pickupLocationId,
        returnLocationId: parsed.data.returnLocationId,
        pickupAt: wallClockToInstant(
          parsed.data.pickupDate,
          parsed.data.pickupTime,
          timezone,
        ),
        returnAt: wallClockToInstant(
          parsed.data.returnDate,
          parsed.data.returnTime,
          timezone,
        ),
        reason: parsed.data.reason || null,
      },
      ctx.user.userId,
    );
  } catch (error) {
    if (error instanceof ReservationConflictError) {
      return { conflicts: error.conflicts };
    }
    if (error instanceof VehicleUnavailableError) {
      return {
        conflicts: [
          "The vehicle was taken while you were editing. Reload and try again.",
        ],
      };
    }
    if (error instanceof ModificationNotAllowedError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Extend (spec §56)
// ---------------------------------------------------------------------------

const extendSchema = z.object({
  reservationId: z.string().min(1),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a return date"),
  returnTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a return time"),
  reason: z.string().trim().max(300),
});

export async function extendReservationAction(
  slug: string,
  _prev: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  const ctx = await requirePermission("reservations.manage");

  const parsed = extendSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    returnDate: text(formData, "returnDate"),
    returnTime: text(formData, "returnTime"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const timezone = await agencyTimezone(ctx.user.agencyId);

  try {
    const result = await extendReservation(
      ctx.db,
      parsed.data.reservationId,
      wallClockToInstant(parsed.data.returnDate, parsed.data.returnTime, timezone),
      ctx.user.userId,
      parsed.data.reason || null,
    );

    revalidate(slug, parsed.data.reservationId);
    return {
      saved: true,
      message: `Extended. Additional amount: ${result.additionalAmount}`,
    };
  } catch (error) {
    if (error instanceof ReservationConflictError) {
      return { conflicts: error.conflicts };
    }
    if (error instanceof VehicleUnavailableError) {
      return {
        conflicts: [
          "The vehicle was booked for that period while you were editing.",
        ],
      };
    }
    if (error instanceof ModificationNotAllowedError) {
      return { message: error.message };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Price override (spec §26) — Owner only
// ---------------------------------------------------------------------------

const overrideSchema = z.object({
  reservationId: z.string().min(1),
  newTotal: moneyString,
  reason: z.string().trim().min(3, "A reason is required"),
});

export async function overridePriceAction(
  slug: string,
  _prev: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  // Deliberately Owner-only: an employee must not be able to discount a rental
  // (spec §5, §97.9, §97.17).
  const ctx = await requirePermission("pricing.override");

  const parsed = overrideSchema.safeParse({
    reservationId: text(formData, "reservationId"),
    newTotal: text(formData, "newTotal"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    await overrideReservationPrice(
      ctx.db,
      parsed.data.reservationId,
      parsed.data.newTotal,
      parsed.data.reason,
      ctx.user.userId,
    );
  } catch (error) {
    if (error instanceof ModificationNotAllowedError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidate(slug, parsed.data.reservationId);
  return { saved: true };
}
