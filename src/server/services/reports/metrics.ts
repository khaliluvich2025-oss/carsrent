import { subtract, sum } from "@/lib/money";
import type { TenantDb } from "@/server/tenant";
import {
  computeAverageBookingValue,
  computeAverageDuration,
  computeNetContribution,
  computeRepeatRate,
  computeUtilization,
  rankCounts,
  safeRate,
} from "./calculations";
import { periodDays, type Period } from "./period";

/**
 * Report aggregations (spec §69, §70, §71).
 *
 * Revenue is always money *received* net of refunds, never the sum of quoted
 * totals — and security deposits never appear in it, because they are the
 * customer's money being held (spec §97.8).
 */

export type Headline = {
  revenue: string;
  reservations: number;
  completed: number;
  cancelled: number;
  averageBookingValue: string;
  utilization: { rate: number; rentedDays: number; availableDays: number };
  expenses: string;
  outstanding: string;
  depositsHeld: string;
  returningCustomers: { repeat: number; total: number; rate: number };
};

export async function getHeadlineMetrics(
  db: TenantDb,
  period: Period,
): Promise<Headline> {
  const window = { gte: period.start, lt: period.end };

  const [
    earned,
    refunded,
    created,
    byStatus,
    completedInPeriod,
    expenses,
    outstanding,
    deposits,
    vehicleCount,
    customerBookings,
  ] = await Promise.all([
    db.payment.aggregate({
      _sum: { amount: true },
      where: { status: "COMPLETED", type: { not: "REFUND" }, createdAt: window },
    }),
    db.payment.aggregate({
      _sum: { amount: true },
      where: { status: "COMPLETED", type: "REFUND", createdAt: window },
    }),
    db.reservation.count({ where: { createdAt: window } }),
    db.reservation.groupBy({
      by: ["status"],
      where: { createdAt: window },
      _count: { _all: true },
    }),
    db.reservation.findMany({
      where: { status: "COMPLETED", completedAt: window },
      select: { rentalDays: true, finalTotal: true },
    }),
    db.vehicleExpense.aggregate({
      _sum: { amount: true },
      where: { expenseDate: window },
    }),
    // Outstanding is a position right now, not a windowed figure.
    db.reservation.aggregate({
      _sum: { amountRemaining: true },
      where: {
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
    db.securityDeposit.aggregate({
      _sum: {
        collectedAmount: true,
        refundedAmount: true,
        retainedAmount: true,
      },
      where: { status: { in: ["COLLECTED", "HELD", "PARTIALLY_REFUNDED"] } },
    }),
    db.vehicle.count({ where: { isActive: true } }),
    db.reservation.groupBy({
      by: ["customerId"],
      where: { createdAt: window },
      _count: { _all: true },
    }),
  ]);

  const revenue = subtract(earned._sum.amount ?? 0, refunded._sum.amount ?? 0);

  const counts: Record<string, number> = {};
  for (const row of byStatus) counts[row.status] = row._count._all;

  const rentedDays = completedInPeriod.reduce(
    (total, row) => total + row.rentalDays,
    0,
  );

  return {
    revenue: revenue.toFixed(2),
    reservations: created,
    completed: counts.COMPLETED ?? 0,
    cancelled: (counts.CANCELLED ?? 0) + (counts.NO_SHOW ?? 0),
    averageBookingValue: computeAverageBookingValue(
      sum(...completedInPeriod.map((row) => row.finalTotal)),
      completedInPeriod.length,
    ),
    utilization: computeUtilization({
      rentedDays,
      vehicleCount,
      periodDays: periodDays(period),
    }),
    expenses: sum(expenses._sum.amount ?? 0).toFixed(2),
    outstanding: sum(outstanding._sum.amountRemaining ?? 0).toFixed(2),
    depositsHeld: subtract(
      deposits._sum.collectedAmount ?? 0,
      sum(deposits._sum.refundedAmount ?? 0, deposits._sum.retainedAmount ?? 0),
    ).toFixed(2),
    returningCustomers: computeRepeatRate(
      customerBookings.map((row) => row._count._all),
    ),
  };
}

export type VehiclePerformanceRow = {
  vehicleId: string;
  label: string;
  registrationNumber: string;
  rentals: number;
  rentalDays: number;
  revenue: string;
  expenses: string;
  netContribution: string;
  utilization: number;
  damageCount: number;
};

/** Per-vehicle performance (spec §62, §70). */
export async function getVehiclePerformance(
  db: TenantDb,
  period: Period,
): Promise<VehiclePerformanceRow[]> {
  const window = { gte: period.start, lt: period.end };
  const days = periodDays(period);

  const [vehicles, completed, payments, expenses, damage] = await Promise.all([
    db.vehicle.findMany({
      where: { isActive: true },
      select: {
        id: true,
        brand: true,
        model: true,
        registrationNumber: true,
      },
    }),
    db.reservation.findMany({
      where: { status: "COMPLETED", completedAt: window },
      select: { vehicleId: true, rentalDays: true },
    }),
    db.payment.findMany({
      where: { status: "COMPLETED", createdAt: window },
      select: {
        type: true,
        amount: true,
        reservation: { select: { vehicleId: true } },
      },
    }),
    db.vehicleExpense.groupBy({
      by: ["vehicleId"],
      where: { expenseDate: window },
      _sum: { amount: true },
    }),
    db.damageRecord.groupBy({
      by: ["vehicleId"],
      where: { isPreExisting: false, createdAt: window },
      _count: { _all: true },
    }),
  ]);

  const rentalsByVehicle = new Map<string, { count: number; days: number }>();
  for (const row of completed) {
    const current = rentalsByVehicle.get(row.vehicleId) ?? { count: 0, days: 0 };
    rentalsByVehicle.set(row.vehicleId, {
      count: current.count + 1,
      days: current.days + row.rentalDays,
    });
  }

  const revenueByVehicle = new Map<string, string[]>();
  const refundsByVehicle = new Map<string, string[]>();
  for (const payment of payments) {
    const vehicleId = payment.reservation.vehicleId;
    const target =
      payment.type === "REFUND" ? refundsByVehicle : revenueByVehicle;
    const list = target.get(vehicleId) ?? [];
    list.push(payment.amount.toString());
    target.set(vehicleId, list);
  }

  const expenseByVehicle = new Map(
    expenses.map((row) => [row.vehicleId, row._sum.amount?.toString() ?? "0"]),
  );
  const damageByVehicle = new Map(
    damage.map((row) => [row.vehicleId, row._count._all]),
  );

  return vehicles
    .map((vehicle) => {
      const rentals = rentalsByVehicle.get(vehicle.id) ?? { count: 0, days: 0 };
      const revenue = subtract(
        sum(...(revenueByVehicle.get(vehicle.id) ?? [])),
        sum(...(refundsByVehicle.get(vehicle.id) ?? [])),
      ).toFixed(2);
      const vehicleExpenses = expenseByVehicle.get(vehicle.id) ?? "0.00";

      return {
        vehicleId: vehicle.id,
        label: `${vehicle.brand} ${vehicle.model}`,
        registrationNumber: vehicle.registrationNumber,
        rentals: rentals.count,
        rentalDays: rentals.days,
        revenue,
        expenses: sum(vehicleExpenses).toFixed(2),
        netContribution: computeNetContribution({
          revenue,
          directExpenses: vehicleExpenses,
        }),
        utilization: safeRate(rentals.days, days),
        damageCount: damageByVehicle.get(vehicle.id) ?? 0,
      };
    })
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));
}

export type BookingAnalytics = {
  byWeekday: { label: string; count: number }[];
  byMonth: { label: string; count: number }[];
  averageDuration: number;
  cancellationRate: number;
  popularLocations: { label: string; count: number }[];
  popularCategories: { label: string; count: number }[];
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Booking analytics (spec §71). */
export async function getBookingAnalytics(
  db: TenantDb,
  period: Period,
  timezone: string,
): Promise<BookingAnalytics> {
  const window = { gte: period.start, lt: period.end };

  const reservations = await db.reservation.findMany({
    where: { createdAt: window },
    select: {
      status: true,
      rentalDays: true,
      pickupDatetime: true,
      pickupLocation: { select: { name: true } },
      vehicle: { select: { category: true } },
    },
  });

  const { TZDate } = await import("@date-fns/tz");

  const weekdayCounts = new Array(7).fill(0);
  const monthCounts = new Array(12).fill(0);
  const locationCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  let cancelled = 0;

  for (const reservation of reservations) {
    const local = new TZDate(reservation.pickupDatetime, timezone);
    weekdayCounts[local.getDay()] += 1;
    monthCounts[local.getMonth()] += 1;

    const location = reservation.pickupLocation.name;
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);

    const category = reservation.vehicle.category;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);

    if (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") {
      cancelled += 1;
    }
  }

  return {
    byWeekday: weekdayCounts.map((count, index) => ({
      label: WEEKDAYS[index],
      count,
    })),
    byMonth: monthCounts.map((count, index) => ({
      label: MONTHS[index],
      count,
    })),
    averageDuration: computeAverageDuration(
      reservations.map((row) => row.rentalDays),
    ),
    cancellationRate: safeRate(cancelled, reservations.length),
    popularLocations: rankCounts(
      [...locationCounts].map(([label, count]) => ({ label, count })),
      5,
    ),
    popularCategories: rankCounts(
      [...categoryCounts].map(([label, count]) => ({ label, count })),
      5,
    ),
  };
}
