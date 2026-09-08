"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formatInTimezone, wallClockToInstant } from "@/lib/dates";
import { fieldErrors } from "@/lib/validation";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { createVehicleBlock } from "@/server/services/availability/blocks";
import { VehicleUnavailableError } from "@/server/services/availability/errors";
import { findConflicts } from "@/server/services/availability/search";

export type BlockFormState = {
  errors?: Record<string, string>;
  /** Human-readable conflicts that must be resolved first (spec §58) */
  conflicts?: string[];
  saved?: boolean;
};

const blockSchema = z
  .object({
    vehicleId: z.string().min(1, "Choose a vehicle"),
    kind: z.enum(["MANUAL", "MAINTENANCE"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a start date"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a start time"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an end date"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter an end time"),
    reason: z.string().trim().max(200),
  })
  .superRefine((value, ctx) => {
    if (
      `${value.endDate}T${value.endTime}` <= `${value.startDate}T${value.startTime}`
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The block must end after it starts",
      });
    }
  });

/**
 * Take a vehicle off the road (spec §58).
 *
 * Conflicts are looked up first so the Owner is told *which* bookings are in the
 * way rather than just refused — §58 requires the conflict to be surfaced and
 * resolved, not silently rejected. The exclusion constraint is still the
 * backstop if something is created in the gap between the check and the insert.
 */
export async function createBlockAction(
  agencySlug: string,
  _prev: BlockFormState,
  formData: FormData,
): Promise<BlockFormState> {
  const ctx = await requirePermission("maintenance.manage");

  const value = (name: string) => (formData.get(name) ?? "").toString();
  const parsed = blockSchema.safeParse({
    vehicleId: value("vehicleId"),
    kind: value("kind"),
    startDate: value("startDate"),
    startTime: value("startTime"),
    endDate: value("endDate"),
    endTime: value("endTime"),
    reason: value("reason"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const agency = await db.agency.findUnique({
    where: { id: ctx.user.agencyId },
    select: { timezone: true },
  });
  const timezone = agency?.timezone ?? "Africa/Casablanca";

  const startsAt = wallClockToInstant(
    parsed.data.startDate,
    parsed.data.startTime,
    timezone,
  );
  const endsAt = wallClockToInstant(
    parsed.data.endDate,
    parsed.data.endTime,
    timezone,
  );

  const vehicle = await ctx.db.vehicle.findUnique({
    where: { id: parsed.data.vehicleId },
    select: { id: true },
  });
  if (!vehicle) return { errors: { vehicleId: "Vehicle not found." } };

  // Maintenance and manual blocks take no turnaround buffer of their own.
  const conflicts = await findConflicts(ctx.db, parsed.data.vehicleId, {
    pickupAt: startsAt,
    returnAt: endsAt,
    bufferMinutes: 0,
  });

  if (conflicts.length > 0) {
    return {
      conflicts: conflicts.map((conflict) => {
        const when = `${formatInTimezone(conflict.startsAt, timezone, "dd MMM HH:mm")} → ${formatInTimezone(conflict.endsAt, timezone, "dd MMM HH:mm")}`;
        if (conflict.reservation) {
          return `${conflict.reservation.bookingReference} · ${conflict.reservation.customer.fullName} · ${when}`;
        }
        return `${conflict.kind === "MAINTENANCE" ? "Maintenance" : "Block"}${conflict.reason ? ` (${conflict.reason})` : ""} · ${when}`;
      }),
    };
  }

  try {
    if (parsed.data.kind === "MAINTENANCE") {
      // A maintenance block gets a record so it shows in the vehicle's history
      // and can carry a cost later (spec §57).
      const maintenanceBlock = await ctx.db.maintenanceBlock.create({
        data: {
          agencyId: ctx.db.$agencyId,
          vehicleId: parsed.data.vehicleId,
          startsAt,
          endsAt,
          reason: parsed.data.reason || null,
          createdById: ctx.user.userId,
        },
        select: { id: true },
      });

      await createVehicleBlock(ctx.db, {
        vehicleId: parsed.data.vehicleId,
        kind: "MAINTENANCE",
        startsAt,
        endsAt,
        maintenanceBlockId: maintenanceBlock.id,
        reason: parsed.data.reason || null,
        createdById: ctx.user.userId,
      });
    } else {
      await createVehicleBlock(ctx.db, {
        vehicleId: parsed.data.vehicleId,
        kind: "MANUAL",
        startsAt,
        endsAt,
        reason: parsed.data.reason || null,
        createdById: ctx.user.userId,
      });
    }
  } catch (error) {
    if (error instanceof VehicleUnavailableError) {
      return {
        conflicts: [
          "Something was booked for this vehicle while you were filling in the form. Reload the calendar and try again.",
        ],
      };
    }
    throw error;
  }

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action:
        parsed.data.kind === "MAINTENANCE"
          ? "vehicle.maintenance_block"
          : "vehicle.manual_block",
      entityType: "Vehicle",
      entityId: parsed.data.vehicleId,
      newValue: {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: parsed.data.reason || null,
      },
    },
  });

  revalidatePath(`/${agencySlug}/dashboard/calendar`);
  revalidatePath(`/${agencySlug}/dashboard/fleet/${parsed.data.vehicleId}`);
  return { saved: true };
}

/** Release a manual block. Reservations and maintenance are removed elsewhere. */
export async function removeBlockAction(
  agencySlug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission("maintenance.manage");
  const blockId = (formData.get("blockId") ?? "").toString();
  if (!blockId) return;

  const block = await ctx.db.vehicleBlock.findUnique({
    where: { id: blockId },
    select: { id: true, kind: true, vehicleId: true },
  });

  // Only manual blocks: removing a reservation's block would silently free a
  // car that a customer still believes they have booked.
  if (!block || block.kind !== "MANUAL") return;

  await ctx.db.vehicleBlock.delete({ where: { id: block.id } });

  await ctx.db.auditLog.create({
    data: {
      agencyId: ctx.db.$agencyId,
      userId: ctx.user.userId,
      action: "vehicle.manual_block_release",
      entityType: "Vehicle",
      entityId: block.vehicleId,
    },
  });

  revalidatePath(`/${agencySlug}/dashboard/calendar`);
  revalidatePath(`/${agencySlug}/dashboard/fleet/${block.vehicleId}`);
}
