import { agencyDayBounds } from "@/lib/dates";
import type { TenantDb } from "@/server/tenant";

/**
 * Operational alerts (spec §67, §82).
 *
 * Derived live from the data rather than stored as notification rows. An alert
 * is a statement about the present — "this rental is overdue" — and a stored
 * copy of that statement can only ever be wrong later. Deriving them means the
 * list is never stale and there is no queue to reconcile.
 *
 * Owner-only alerts are filtered by permission, so an employee's list stays
 * operational (spec §64, §67).
 */

export type AlertTone = "critical" | "caution" | "info";

export type Alert = {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
  href: string;
  count: number;
  /** Requires this permission to be shown */
  permission: string;
};

export async function getOperationalAlerts(
  db: TenantDb,
  slug: string,
  timezone: string,
): Promise<Alert[]> {
  const now = new Date();
  const today = agencyDayBounds(now, timezone);
  const inThirtyDays = new Date(now.getTime() + 30 * 86_400_000);
  const base = `/${slug}/dashboard`;

  const [
    awaiting,
    overdue,
    dueBackToday,
    pickupsToday,
    unpaidOpen,
    insuranceExpiring,
    inspectionExpiring,
    serviceDue,
    maintenanceToday,
  ] = await Promise.all([
    db.reservation.count({ where: { status: "AWAITING_CONFIRMATION" } }),
    // A car past its return time that nobody has closed out.
    db.reservation.count({
      where: {
        status: { in: ["ACTIVE", "RETURN_DUE", "OVERDUE"] },
        returnDatetime: { lt: now },
      },
    }),
    db.reservation.count({
      where: {
        status: { in: ["ACTIVE", "RETURN_DUE"] },
        returnDatetime: { gte: today.start, lt: today.end },
      },
    }),
    db.reservation.count({
      where: {
        status: { in: ["CONFIRMED", "READY_FOR_PICKUP"] },
        pickupDatetime: { gte: today.start, lt: today.end },
      },
    }),
    db.reservation.count({
      where: {
        status: {
          in: ["ACTIVE", "RETURN_DUE", "OVERDUE", "RETURN_INSPECTION"],
        },
        amountRemaining: { gt: 0 },
      },
    }),
    db.vehicle.count({
      where: {
        isActive: true,
        insuranceExpiryAt: { not: null, lte: inThirtyDays },
      },
    }),
    db.vehicle.count({
      where: {
        isActive: true,
        technicalInspectionExpiryAt: { not: null, lte: inThirtyDays },
      },
    }),
    // Mileage-based service is compared in the query's absence of column maths,
    // so it is filtered in memory below.
    db.vehicle.findMany({
      where: { isActive: true, nextServiceMileage: { not: null } },
      select: { nextServiceMileage: true, currentMileage: true },
    }),
    db.vehicleBlock.count({
      where: {
        kind: "MAINTENANCE",
        startsAt: { gte: today.start, lt: today.end },
      },
    }),
  ]);

  const serviceDueCount = serviceDue.filter(
    (vehicle) =>
      vehicle.nextServiceMileage !== null &&
      vehicle.nextServiceMileage - vehicle.currentMileage <= 1000,
  ).length;

  const alerts: Alert[] = [
    {
      id: "overdue",
      tone: "critical",
      title: `${overdue} overdue ${overdue === 1 ? "rental" : "rentals"}`,
      detail: "Past the return time and not closed out.",
      href: `${base}/reservations?status=OVERDUE`,
      count: overdue,
      permission: "reservations.view",
    },
    {
      id: "awaiting",
      tone: "caution",
      title: `${awaiting} waiting for a call`,
      detail: "The dates are held until you confirm or cancel.",
      href: `${base}/reservations?bucket=awaiting`,
      count: awaiting,
      permission: "reservations.view",
    },
    {
      id: "pickups",
      tone: "info",
      title: `${pickupsToday} ${pickupsToday === 1 ? "pickup" : "pickups"} today`,
      detail: "Cars going out.",
      href: `${base}/reservations?bucket=today_pickup`,
      count: pickupsToday,
      permission: "reservations.view",
    },
    {
      id: "returns",
      tone: "info",
      title: `${dueBackToday} ${dueBackToday === 1 ? "return" : "returns"} today`,
      detail: "Cars coming back.",
      href: `${base}/reservations?bucket=today_return`,
      count: dueBackToday,
      permission: "reservations.view",
    },
    {
      id: "unpaid",
      tone: "caution",
      title: `${unpaidOpen} with money outstanding`,
      detail: "Open rentals with a balance still to collect.",
      href: `${base}/reservations?bucket=open`,
      count: unpaidOpen,
      permission: "dashboard.financials",
    },
    {
      id: "maintenance-today",
      tone: "info",
      title: `${maintenanceToday} maintenance ${maintenanceToday === 1 ? "block" : "blocks"} starting today`,
      detail: "Cars going off the road.",
      href: `${base}/calendar`,
      count: maintenanceToday,
      permission: "maintenance.view",
    },
    {
      id: "service",
      tone: "caution",
      title: `${serviceDueCount} due a service`,
      detail: "Within 1,000 km of the next service.",
      href: `${base}/fleet`,
      count: serviceDueCount,
      permission: "fleet.view",
    },
    {
      id: "insurance",
      tone: "caution",
      title: `${insuranceExpiring} with insurance expiring`,
      detail: "Within the next 30 days.",
      href: `${base}/fleet`,
      count: insuranceExpiring,
      permission: "fleet.view",
    },
    {
      id: "inspection",
      tone: "caution",
      title: `${inspectionExpiring} due a technical inspection`,
      detail: "Within the next 30 days.",
      href: `${base}/fleet`,
      count: inspectionExpiring,
      permission: "fleet.view",
    },
  ];

  // Nothing to act on is not worth a line on the screen.
  return alerts.filter((alert) => alert.count > 0);
}
