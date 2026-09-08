import type { Prisma, ReservationStatus } from "@prisma/client";

import { normalizePhone } from "@/lib/phone";
import type { TenantDb } from "@/server/tenant";
import { normalizeBookingReference } from "@/server/services/booking/reference";

/**
 * Reservation queries for the dashboard (spec §6 phase, §63, §64).
 */

export type ReservationFilters = {
  status?: ReservationStatus | "";
  /** Convenience buckets the dashboard links to */
  bucket?: "awaiting" | "today_pickup" | "today_return" | "open" | "";
  q?: string;
  from?: Date;
  to?: Date;
};

const listSelect = {
  id: true,
  bookingReference: true,
  status: true,
  paymentStatus: true,
  pickupDatetime: true,
  returnDatetime: true,
  rentalDays: true,
  finalTotal: true,
  amountPaid: true,
  amountRemaining: true,
  currency: true,
  createdAt: true,
  customer: { select: { id: true, fullName: true, phone: true } },
  vehicle: {
    select: {
      id: true,
      brand: true,
      model: true,
      registrationNumber: true,
      images: {
        where: { isCover: true },
        take: 1,
        select: { file: { select: { publicUrl: true } } },
      },
    },
  },
  pickupLocation: { select: { name: true } },
  returnLocation: { select: { name: true } },
} satisfies Prisma.ReservationSelect;

export type ReservationListItem = Prisma.ReservationGetPayload<{
  select: typeof listSelect;
}>;

export const OPEN_STATUSES: ReservationStatus[] = [
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "RETURN_DUE",
  "OVERDUE",
  "RETURN_INSPECTION",
];

function buildWhere(
  filters: ReservationFilters,
  today: { start: Date; end: Date },
): Prisma.ReservationWhereInput {
  const where: Prisma.ReservationWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  } else if (filters.bucket === "awaiting") {
    where.status = "AWAITING_CONFIRMATION";
  } else if (filters.bucket === "open") {
    where.status = { in: OPEN_STATUSES };
  } else if (filters.bucket === "today_pickup") {
    where.status = { in: ["CONFIRMED", "READY_FOR_PICKUP"] };
    where.pickupDatetime = { gte: today.start, lt: today.end };
  } else if (filters.bucket === "today_return") {
    where.status = { in: ["ACTIVE", "RETURN_DUE", "OVERDUE"] };
    where.returnDatetime = { gte: today.start, lt: today.end };
  }

  if (filters.from || filters.to) {
    where.pickupDatetime = {
      ...(typeof where.pickupDatetime === "object" ? where.pickupDatetime : {}),
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lt: filters.to } : {}),
    };
  }

  if (filters.q) {
    const q = filters.q.trim();
    // A search box that only matches one field is a search box people stop
    // using: try the reference, the name, and the phone in its stored form.
    where.OR = [
      { bookingReference: { contains: normalizeBookingReference(q), mode: "insensitive" } },
      { bookingReference: { contains: q, mode: "insensitive" } },
      { customer: { fullName: { contains: q, mode: "insensitive" } } },
      { customer: { phone: { contains: normalizePhone(q) || q } } },
      { vehicle: { registrationNumber: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function listReservations(
  db: TenantDb,
  filters: ReservationFilters,
  today: { start: Date; end: Date },
): Promise<ReservationListItem[]> {
  return db.reservation.findMany({
    where: buildWhere(filters, today),
    select: listSelect,
    orderBy:
      filters.bucket === "today_return"
        ? { returnDatetime: "asc" }
        : filters.bucket === "today_pickup"
          ? { pickupDatetime: "asc" }
          : { createdAt: "desc" },
    take: 100,
  });
}

/** Counts for the status chips, computed in one pass. */
export async function countReservationsByStatus(
  db: TenantDb,
): Promise<Record<string, number>> {
  const rows = await db.reservation.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    counts[row.status] = row._count._all;
    total += row._count._all;
  }
  counts.ALL = total;
  counts.OPEN = OPEN_STATUSES.reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0,
  );
  return counts;
}

export async function getReservation(db: TenantDb, id: string) {
  return db.reservation.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          nationality: true,
          status: true,
        },
      },
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          registrationNumber: true,
          transmission: true,
          fuelType: true,
          seats: true,
          currentMileage: true,
          images: {
            where: { isCover: true },
            take: 1,
            select: { file: { select: { publicUrl: true } } },
          },
        },
      },
      pickupLocation: { select: { id: true, name: true } },
      returnLocation: { select: { id: true, name: true } },
      extras: {
        select: {
          id: true,
          name: true,
          priceType: true,
          unitPrice: true,
          quantity: true,
          amount: true,
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          amount: true,
          method: true,
          status: true,
          createdAt: true,
          createdBy: { select: { fullName: true } },
        },
      },
      securityDeposit: true,
      additionalCharges: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          description: true,
          amount: true,
          settleFromDeposit: true,
          createdAt: true,
        },
      },
      contracts: {
        orderBy: { version: "desc" },
        select: { id: true, contractNumber: true, version: true, status: true },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
          changedBy: { select: { fullName: true } },
        },
      },
      changes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          changeType: true,
          priceDelta: true,
          reason: true,
          createdAt: true,
          changedBy: { select: { fullName: true } },
        },
      },
    },
  });
}

export type ReservationDetail = NonNullable<
  Awaited<ReturnType<typeof getReservation>>
>;
