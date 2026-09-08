import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardHeader, StatTile } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/money";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { formatPercent } from "@/server/services/reports/calculations";
import {
  getBookingAnalytics,
  getHeadlineMetrics,
  getVehiclePerformance,
} from "@/server/services/reports/metrics";
import { resolvePeriod, PERIOD_KEYS } from "@/server/services/reports/period";

export const metadata: Metadata = { title: "Reports" };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (params: SearchParams, key: string) => {
  const value = params[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").toString();
};

const PERIOD_LABELS: Record<string, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  custom: "Custom",
};

function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 truncate text-ink-muted">
            {row.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="block h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-end tabular-nums text-ink">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ agency: slug }, rawParams] = await Promise.all([
    params,
    searchParams,
  ]);
  // Reports are Owner-only (spec §69).
  const ctx = await requirePermission("reports.view");

  const agency = await db.agency.findUnique({
    where: { id: ctx.user.agencyId },
    select: { timezone: true, currency: true },
  });
  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const currency = agency?.currency ?? "MAD";

  const period = resolvePeriod(first(rawParams, "period") || "month", timezone, {
    from: first(rawParams, "from") || undefined,
    to: first(rawParams, "to") || undefined,
  });

  const [headline, vehicles, analytics] = await Promise.all([
    getHeadlineMetrics(ctx.db, period),
    getVehiclePerformance(ctx.db, period),
    getBookingAnalytics(ctx.db, period, timezone),
  ]);

  const base = `/${slug}/dashboard/reports`;
  const exportHref = (dataset: string) => {
    const search = new URLSearchParams({ dataset, period: period.key });
    if (period.key === "custom") {
      search.set("from", first(rawParams, "from"));
      search.set("to", first(rawParams, "to"));
    }
    return `${base}/export?${search.toString()}`;
  };

  const canExport = ctx.can("reports.export");

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${period.label} · ${formatMoney(headline.revenue, currency)} received`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIOD_KEYS.filter((key) => key !== "custom").map((key) => (
          <Link
            key={key}
            href={`${base}?period=${key}`}
            className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
              period.key === key
                ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-line bg-surface text-ink-soft hover:border-line-strong"
            }`}
          >
            {PERIOD_LABELS[key]}
          </Link>
        ))}

        <form method="get" action={base} className="flex items-center gap-2">
          <input type="hidden" name="period" value="custom" />
          <Input
            name="from"
            type="date"
            defaultValue={first(rawParams, "from")}
            aria-label="From"
            className="w-40"
          />
          <Input
            name="to"
            type="date"
            defaultValue={first(rawParams, "to")}
            aria-label="To"
            className="w-40"
          />
          <button
            type="submit"
            className="h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-soft"
          >
            Apply
          </button>
        </form>
      </div>

      <section className="mb-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Revenue"
            value={formatMoney(headline.revenue, currency)}
            hint="Received, net of refunds"
          />
          <StatTile
            label="Reservations"
            value={headline.reservations}
            hint={`${headline.completed} completed · ${headline.cancelled} cancelled`}
          />
          <StatTile
            label="Average booking"
            value={formatMoney(headline.averageBookingValue, currency)}
          />
          <StatTile
            label="Fleet utilisation"
            value={formatPercent(headline.utilization.rate)}
            hint={`${headline.utilization.rentedDays} of ${headline.utilization.availableDays} vehicle-days`}
          />
          <StatTile
            label="Expenses"
            value={formatMoney(headline.expenses, currency)}
          />
          <StatTile
            label="Outstanding"
            value={formatMoney(headline.outstanding, currency)}
            tone={Number(headline.outstanding) > 0 ? "caution" : "neutral"}
            hint="Owed right now"
          />
          <StatTile
            label="Deposits held"
            value={formatMoney(headline.depositsHeld, currency)}
            hint="Customer money, not revenue"
          />
          <StatTile
            label="Returning customers"
            value={formatPercent(headline.returningCustomers.rate)}
            hint={`${headline.returningCustomers.repeat} of ${headline.returningCustomers.total}`}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader
                title="Vehicle performance"
                description="Net contribution is revenue less expenses booked against that vehicle. Agency-wide costs are not included, so it is not profit."
                action={
                  canExport ? (
                    <Link
                      href={exportHref("vehicles")}
                      className="text-sm font-medium text-[var(--brand)] hover:underline"
                    >
                      Export CSV
                    </Link>
                  ) : null
                }
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-line bg-surface-sunken text-xs text-ink-muted">
                    <th className="px-5 py-2 text-start font-medium">Vehicle</th>
                    <th className="px-3 py-2 text-end font-medium">Rentals</th>
                    <th className="px-3 py-2 text-end font-medium">Days</th>
                    <th className="px-3 py-2 text-end font-medium">Util.</th>
                    <th className="px-3 py-2 text-end font-medium">Revenue</th>
                    <th className="px-3 py-2 text-end font-medium">Expenses</th>
                    <th className="px-5 py-2 text-end font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {vehicles.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-8 text-center text-ink-muted"
                      >
                        No active vehicles in this period.
                      </td>
                    </tr>
                  ) : (
                    vehicles.map((vehicle) => (
                      <tr key={vehicle.vehicleId}>
                        <td className="px-5 py-2.5">
                          <span className="font-medium text-ink">
                            {vehicle.label}
                          </span>
                          <span className="block font-mono text-[11px] text-ink-muted">
                            {vehicle.registrationNumber}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">
                          {vehicle.rentals}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">
                          {vehicle.rentalDays}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-ink-muted">
                          {formatPercent(vehicle.utilization)}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">
                          {formatMoney(vehicle.revenue, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-ink-muted">
                          {formatMoney(vehicle.expenses, currency)}
                        </td>
                        <td
                          className={`px-5 py-2.5 text-end font-medium tabular-nums ${
                            Number(vehicle.netContribution) < 0
                              ? "text-critical"
                              : "text-ink"
                          }`}
                        >
                          {formatMoney(vehicle.netContribution, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Booking patterns" />
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  Pickups by day
                </p>
                <Bars rows={analytics.byWeekday} />
              </div>
              <div className="border-t border-line pt-3">
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Average duration</dt>
                    <dd className="font-medium text-ink">
                      {analytics.averageDuration} days
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Cancellation rate</dt>
                    <dd className="font-medium text-ink">
                      {formatPercent(analytics.cancellationRate)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Most popular" />
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  Pickup locations
                </p>
                {analytics.popularLocations.length === 0 ? (
                  <p className="text-sm text-ink-muted">No bookings yet.</p>
                ) : (
                  <Bars rows={analytics.popularLocations} />
                )}
              </div>
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  Categories
                </p>
                {analytics.popularCategories.length === 0 ? (
                  <p className="text-sm text-ink-muted">No bookings yet.</p>
                ) : (
                  <Bars rows={analytics.popularCategories} />
                )}
              </div>
            </div>
          </Card>

          {canExport ? (
            <Card>
              <CardHeader
                title="Exports"
                description="CSV, opens directly in Excel."
              />
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "reservations", label: "Reservations" },
                  { key: "payments", label: "Payments" },
                  { key: "expenses", label: "Expenses" },
                  { key: "vehicles", label: "Vehicles" },
                  { key: "customers", label: "Customers" },
                ].map((item) => (
                  <Link
                    key={item.key}
                    href={exportHref(item.key)}
                    className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-soft transition hover:border-line-strong hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
