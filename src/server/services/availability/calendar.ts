import type { VehicleBlockKind, VehicleStatus } from "@prisma/client";

import {
  agencyDayBounds,
  agencyMonthBounds,
  agencyWeekBounds,
} from "@/lib/dates";
import type { TenantDb } from "@/server/tenant";
import type { CalendarView } from "./range";

/**
 * Data for the fleet calendar (spec §65).
 *
 * Reads straight from `vehicle_blocks`, so the calendar shows exactly what the
 * availability engine sees — there is no separate "calendar" notion of
 * occupancy that could drift out of step with what can actually be booked.
 */

export type CalendarWindow = {
  view: CalendarView;
  start: Date;
  end: Date;
};

export function resolveWindow(
  view: CalendarView,
  anchor: Date,
  timezone: string,
): CalendarWindow {
  const bounds =
    view === "day"
      ? agencyDayBounds(anchor, timezone)
      : view === "week"
        ? agencyWeekBounds(anchor, timezone)
        : agencyMonthBounds(anchor, timezone);

  return { view, start: bounds.start, end: bounds.end };
}

export type CalendarVehicle = {
  id: string;
  brand: string;
  model: string;
  registrationNumber: string;
  currentStatus: VehicleStatus;
};

export type CalendarBlock = {
  id: string;
  vehicleId: string;
  kind: VehicleBlockKind;
  startsAt: Date;
  endsAt: Date;
  bufferMinutes: number;
  label: string;
  detail: string | null;
  reservationId: string | null;
  bookingReference: string | null;
  customerName: string | null;
  reservationStatus: string | null;
  /** Manual blocks are the only ones removable straight from the calendar */
  removable: boolean;
};

const KIND_LABELS: Record<VehicleBlockKind, string> = {
  RESERVATION: "Reserved",
  MAINTENANCE: "Maintenance",
  MANUAL: "Blocked",
  PAYMENT_HOLD: "Checkout hold",
};

export async function getFleetCalendar(
  db: TenantDb,
  window: CalendarWindow,
): Promise<{ vehicles: CalendarVehicle[]; blocks: CalendarBlock[] }> {
  const now = new Date();

  const [vehicles, blocks] = await Promise.all([
    db.vehicle.findMany({
      where: { isActive: true },
      select: {
        id: true,
        brand: true,
        model: true,
        registrationNumber: true,
        currentStatus: true,
      },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
    }),
    db.vehicleBlock.findMany({
      where: {
        startsAt: { lt: window.end },
        endsAt: { gt: window.start },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        vehicleId: true,
        kind: true,
        startsAt: true,
        endsAt: true,
        bufferMinutes: true,
        reason: true,
        reservationId: true,
        reservation: {
          select: {
            bookingReference: true,
            status: true,
            customer: { select: { fullName: true } },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return {
    vehicles,
    blocks: blocks.map((block) => ({
      id: block.id,
      vehicleId: block.vehicleId,
      kind: block.kind,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      bufferMinutes: block.bufferMinutes,
      label:
        block.kind === "RESERVATION"
          ? (block.reservation?.customer.fullName ?? KIND_LABELS.RESERVATION)
          : KIND_LABELS[block.kind],
      detail: block.reason,
      reservationId: block.reservationId,
      bookingReference: block.reservation?.bookingReference ?? null,
      customerName: block.reservation?.customer.fullName ?? null,
      reservationStatus: block.reservation?.status ?? null,
      removable: block.kind === "MANUAL",
    })),
  };
}
