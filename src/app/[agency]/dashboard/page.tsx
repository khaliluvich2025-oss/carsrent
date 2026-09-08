import Link from "next/link";
import type { Metadata } from "next";

import { ReservationStatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatTile } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  IconAlert,
  IconCar,
  IconCheck,
  IconClock,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { agencyDayBounds, formatTimeInTimezone } from "@/lib/dates";
import { formatMoney, subtract, sum } from "@/lib/money";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Overview" };

/** Statuses that mean a rental is live or committed (spec §14). */
const OPEN_STATUSES = [
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "RETURN_DUE",
  "OVERDUE",
  "RETURN_INSPECTION",
] as const;

export default async function DashboardOverview({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency: slug } = await params;
  const ctx = await requireUser();
  const { user, db: tdb, can } = ctx;

  const agency = await db.agency.findUnique({
    where: { id: user.agencyId },
    select: { timezone: true, currency: true, name: true },
  });

  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const currency = agency?.currency ?? "MAD";
  const today = agencyDayBounds(new Date(), timezone);
  const base = `/${slug}/dashboard`;

  const [fleet, awaitingCount, pickupsToday, returnsToday, overdueCount] =
    await Promise.all([
      tdb.vehicle.groupBy({
        by: ["currentStatus"],
        where: { isActive: true },
        _count: { _all: true },
      }),
      tdb.reservation.count({ where: { status: "AWAITING_CONFIRMATION" } }),
      tdb.reservation.findMany({
        where: {
          status: { in: ["CONFIRMED", "READY_FOR_PICKUP"] },
          pickupDatetime: { gte: today.start, lt: today.end },
        },
        select: {
          id: true,
          bookingReference: true,
          status: true,
          pickupDatetime: true,
          customer: { select: { fullName: true } },
          vehicle: { select: { brand: true, model: true } },
          pickupLocation: { select: { name: true } },
        },
        orderBy: { pickupDatetime: "asc" },
        take: 8,
      }),
      tdb.reservation.findMany({
        where: {
          status: { in: ["ACTIVE", "RETURN_DUE", "OVERDUE"] },
          returnDatetime: { gte: today.start, lt: today.end },
        },
        select: {
          id: true,
          bookingReference: true,
          status: true,
          returnDatetime: true,
          customer: { select: { fullName: true } },
          vehicle: { select: { brand: true, model: true } },
          returnLocation: { select: { name: true } },
        },
        orderBy: { returnDatetime: "asc" },
        take: 8,
      }),
      tdb.reservation.count({ where: { status: "OVERDUE" } }),
    ]);

  const byStatus = Object.fromEntries(
    fleet.map((row) => [row.currentStatus, row._count._all]),
  ) as Record<string, number>;
  const totalVehicles = fleet.reduce((acc, row) => acc + row._count._all, 0);

  type Operation = {
    id: string;
    at: Date;
    kind: "PICKUP" | "RETURN";
    reference: string;
    status: (typeof pickupsToday)[number]["status"];
    customer: string;
    vehicle: string;
    location: string;
  };

  const operations: Operation[] = [
    ...pickupsToday.map((r) => ({
      id: `p-${r.id}`,
      at: r.pickupDatetime,
      kind: "PICKUP" as const,
      reference: r.bookingReference,
      status: r.status,
      customer: r.customer.fullName,
      vehicle: `${r.vehicle.brand} ${r.vehicle.model}`,
      location: r.pickupLocation.name,
    })),
    ...returnsToday.map((r) => ({
      id: `r-${r.id}`,
      at: r.returnDatetime,
      kind: "RETURN" as const,
      reference: r.bookingReference,
      status: r.status,
      customer: r.customer.fullName,
      vehicle: `${r.vehicle.brand} ${r.vehicle.model}`,
      location: r.returnLocation.name,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const firstName = user.fullName.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName}`}
        description={
          operations.length === 0
            ? "Nothing scheduled today."
            : `${operations.length} ${operations.length === 1 ? "movement" : "movements"} scheduled today.`
        }
      />

      {/* Attention first — what needs a person to act (spec §96) */}
      {awaitingCount > 0 || overdueCount > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {awaitingCount > 0 ? (
            <Link
              href={`${base}/reservations?status=AWAITING_CONFIRMATION`}
              className="flex items-center gap-3 rounded-card border border-caution/20 bg-caution-soft px-4 py-3.5 transition hover:brightness-[0.98]"
            >
              <span className="text-caution">
                <IconClock size={22} />
              </span>
              <div>
                <p className="text-sm font-semibold text-caution">
                  {awaitingCount} waiting for a phone call
                </p>
                <p className="text-xs text-caution/80">
                  Confirm or cancel to free the dates.
                </p>
              </div>
            </Link>
          ) : null}

          {overdueCount > 0 ? (
            <Link
              href={`${base}/reservations?status=OVERDUE`}
              className="flex items-center gap-3 rounded-card border border-critical/20 bg-critical-soft px-4 py-3.5 transition hover:brightness-[0.98]"
            >
              <span className="text-critical">
                <IconAlert size={22} />
              </span>
              <div>
                <p className="text-sm font-semibold text-critical">
                  {overdueCount} overdue{" "}
                  {overdueCount === 1 ? "rental" : "rentals"}
                </p>
                <p className="text-xs text-critical/80">
                  Car not returned on schedule.
                </p>
              </div>
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Fleet</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Total" value={totalVehicles} />
          <StatTile label="Available" value={byStatus.AVAILABLE ?? 0} />
          <StatTile label="Reserved" value={byStatus.RESERVED ?? 0} />
          <StatTile label="Rented" value={byStatus.RENTED ?? 0} />
          <StatTile
            label="Maintenance"
            value={byStatus.MAINTENANCE ?? 0}
            tone={byStatus.MAINTENANCE ? "caution" : "neutral"}
          />
        </div>
      </section>

      <section className="mb-6">
        <Card>
          <CardHeader
            title="Today's operations"
            description="Pickups and returns in order."
          />
          {operations.length === 0 ? (
            <div className="flex items-center gap-3 py-3 text-sm text-ink-muted">
              <IconCheck size={18} />
              No pickups or returns scheduled today.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {operations.map((op) => (
                <li
                  key={op.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="w-14 shrink-0 text-sm font-semibold text-ink tabular-nums">
                    {formatTimeInTimezone(op.at, timezone)}
                  </div>
                  <div
                    className={`w-1 shrink-0 self-stretch rounded-full ${
                      op.kind === "PICKUP" ? "bg-info" : "bg-[var(--brand)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {op.kind === "PICKUP" ? "Pickup" : "Return"} ·{" "}
                      {op.vehicle}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {op.customer} · {op.location} · {op.reference}
                    </p>
                  </div>
                  <div className="hidden shrink-0 sm:block">
                    <ReservationStatusBadge status={op.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Owner-only financial KPIs — spec §63, §64, §97.17 */}
      {can("dashboard.financials") ? (
        <OwnerFinancials currency={currency} timezone={timezone} />
      ) : null}

      {totalVehicles === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconCar />}
            title="Your fleet is empty"
            description="Add your vehicles to start taking reservations on your website."
            action={
              can("fleet.manage") ? (
                <Link
                  href={`${base}/fleet/new`}
                  className="inline-flex h-11 items-center rounded-lg bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)]"
                >
                  Add your first vehicle
                </Link>
              ) : null
            }
          />
        </div>
      ) : null}
    </>
  );
}

async function OwnerFinancials({
  currency,
  timezone,
}: {
  currency: string;
  timezone: string;
}) {
  const { db: tdb } = await requireUser();

  const today = agencyDayBounds(new Date(), timezone);
  const monthStart = new Date(
    Date.UTC(today.start.getUTCFullYear(), today.start.getUTCMonth(), 1),
  );

  const [
    earnedToday,
    refundedToday,
    earnedMonth,
    refundedMonth,
    outstanding,
    deposits,
  ] = await Promise.all([
    tdb.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "COMPLETED",
        type: { not: "REFUND" },
        createdAt: { gte: today.start, lt: today.end },
      },
    }),
    tdb.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "COMPLETED",
        type: "REFUND",
        createdAt: { gte: today.start, lt: today.end },
      },
    }),
    tdb.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "COMPLETED",
        type: { not: "REFUND" },
        createdAt: { gte: monthStart },
      },
    }),
    tdb.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "COMPLETED",
        type: "REFUND",
        createdAt: { gte: monthStart },
      },
    }),
    tdb.reservation.aggregate({
      _sum: { amountRemaining: true },
      where: { status: { in: [...OPEN_STATUSES] } },
    }),
    // Security deposits are money held, never revenue — spec §28, §97.8
    tdb.securityDeposit.aggregate({
      _sum: {
        collectedAmount: true,
        refundedAmount: true,
        retainedAmount: true,
      },
      where: { status: { in: ["COLLECTED", "HELD", "PARTIALLY_REFUNDED"] } },
    }),
  ]);

  const revenueToday = subtract(
    earnedToday._sum.amount ?? 0,
    refundedToday._sum.amount ?? 0,
  );
  const revenueMonth = subtract(
    earnedMonth._sum.amount ?? 0,
    refundedMonth._sum.amount ?? 0,
  );
  const held = subtract(
    deposits._sum.collectedAmount ?? 0,
    sum(deposits._sum.refundedAmount ?? 0, deposits._sum.retainedAmount ?? 0),
  );

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-ink">Financial</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue today"
          value={formatMoney(revenueToday, currency)}
        />
        <StatTile
          label="Revenue this month"
          value={formatMoney(revenueMonth, currency)}
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(outstanding._sum.amountRemaining ?? 0, currency)}
          hint="Owed on open rentals"
        />
        <StatTile
          label="Deposits held"
          value={formatMoney(held, currency)}
          hint="Customer money, not revenue"
        />
      </div>
    </section>
  );
}
