import type { Prisma } from "@prisma/client";

import { normalizePhone } from "@/lib/phone";
import { subtract, sum } from "@/lib/money";
import type { TenantDb } from "@/server/tenant";

/**
 * Customer CRM (spec §34, §35).
 *
 * Every query here runs through the tenant-scoped client, which is what makes
 * spec §35's hard rule true by construction: Agency A cannot see a customer's
 * history with Agency B. The same person renting from two agencies is two
 * customer records, and neither agency learns about the other.
 */

const listSelect = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  nationality: true,
  status: true,
  createdAt: true,
  _count: { select: { reservations: true } },
  reservations: {
    orderBy: { pickupDatetime: "desc" },
    take: 1,
    select: { pickupDatetime: true, status: true },
  },
} satisfies Prisma.CustomerSelect;

export type CustomerListItem = Prisma.CustomerGetPayload<{
  select: typeof listSelect;
}>;

export type CustomerFilters = {
  q?: string;
  status?: "NORMAL" | "WATCHLIST" | "BLACKLISTED" | "";
};

export async function listCustomers(
  db: TenantDb,
  filters: CustomerFilters,
): Promise<CustomerListItem[]> {
  const where: Prisma.CustomerWhereInput = {};

  if (filters.status) where.status = filters.status;

  if (filters.q) {
    const q = filters.q.trim();
    const asPhone = normalizePhone(q);
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      // Match the stored (normalised) form, so searching "+212 661 234 567"
      // finds the customer stored as "+212661234567".
      { phone: { contains: asPhone || q } },
    ];
  }

  return db.customer.findMany({
    where,
    select: listSelect,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function countCustomersByStatus(db: TenantDb) {
  const rows = await db.customer.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const counts: Record<string, number> = {
    NORMAL: 0,
    WATCHLIST: 0,
    BLACKLISTED: 0,
    ALL: 0,
  };
  for (const row of rows) {
    counts[row.status] = row._count._all;
    counts.ALL += row._count._all;
  }
  return counts;
}

export async function getCustomer(db: TenantDb, id: string) {
  return db.customer.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          documentType: true,
          documentNumber: true,
          expiryDate: true,
          verificationStatus: true,
          verifiedAt: true,
          fileId: true,
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          createdBy: { select: { fullName: true } },
        },
      },
      reservations: {
        orderBy: { pickupDatetime: "desc" },
        select: {
          id: true,
          bookingReference: true,
          status: true,
          pickupDatetime: true,
          returnDatetime: true,
          rentalDays: true,
          finalTotal: true,
          amountRemaining: true,
          currency: true,
          vehicle: {
            select: { brand: true, model: true, registrationNumber: true },
          },
        },
      },
    },
  });
}

export type CustomerProfile = NonNullable<
  Awaited<ReturnType<typeof getCustomer>>
>;

export type CustomerStats = {
  totalReservations: number;
  completed: number;
  cancelled: number;
  active: number;
  /** Money actually received from this customer, net of refunds */
  totalSpend: string;
  outstanding: string;
  firstBooking: Date | null;
  lastBooking: Date | null;
  damageCount: number;
};

/**
 * Profile statistics (spec §35).
 *
 * "Total rental spend" is money actually received net of refunds, not the sum of
 * quoted totals — a cancelled booking that was never paid is not spend, and a
 * refunded one is not either.
 */
export async function getCustomerStats(
  db: TenantDb,
  customerId: string,
): Promise<CustomerStats> {
  const [byStatus, bounds, earned, refunded, outstanding, damageCount] =
    await Promise.all([
      db.reservation.groupBy({
        by: ["status"],
        where: { customerId },
        _count: { _all: true },
      }),
      db.reservation.aggregate({
        where: { customerId },
        _min: { pickupDatetime: true },
        _max: { pickupDatetime: true },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: "COMPLETED",
          type: { not: "REFUND" },
          reservation: { customerId },
        },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: "COMPLETED",
          type: "REFUND",
          reservation: { customerId },
        },
      }),
      db.reservation.aggregate({
        _sum: { amountRemaining: true },
        where: {
          customerId,
          status: {
            in: [
              "CONFIRMED",
              "READY_FOR_PICKUP",
              "ACTIVE",
              "RETURN_DUE",
              "OVERDUE",
              "RETURN_INSPECTION",
            ],
          },
        },
      }),
      db.damageRecord.count({
        where: { isPreExisting: false, reservation: { customerId } },
      }),
    ]);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of byStatus) {
    counts[row.status] = row._count._all;
    total += row._count._all;
  }

  return {
    totalReservations: total,
    completed: counts.COMPLETED ?? 0,
    cancelled: (counts.CANCELLED ?? 0) + (counts.NO_SHOW ?? 0),
    active:
      (counts.ACTIVE ?? 0) +
      (counts.RETURN_DUE ?? 0) +
      (counts.OVERDUE ?? 0) +
      (counts.RETURN_INSPECTION ?? 0),
    totalSpend: subtract(
      earned._sum.amount ?? 0,
      refunded._sum.amount ?? 0,
    ).toFixed(2),
    outstanding: sum(outstanding._sum.amountRemaining ?? 0).toFixed(2),
    firstBooking: bounds._min.pickupDatetime,
    lastBooking: bounds._max.pickupDatetime,
    damageCount,
  };
}
