import Link from "next/link";
import type { Metadata } from "next";
import type { ReservationStatus } from "@prisma/client";

import {
  RESERVATION_STATUS_LABELS,
  ReservationStatusBadge,
} from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { IconClipboard, IconSearch } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { agencyDayBounds, formatInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  countReservationsByStatus,
  listReservations,
} from "@/server/services/reservations/queries";

export const metadata: Metadata = { title: "Reservations" };

const CHIP_STATUSES: ReservationStatus[] = [
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "ACTIVE",
  "OVERDUE",
  "COMPLETED",
  "CANCELLED",
];

type SearchParams = Record<string, string | string[] | undefined>;

const first = (params: SearchParams, key: string) => {
  const value = params[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").toString();
};

export default async function ReservationsPage({
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
  const ctx = await requirePermission("reservations.view");

  const agency = await db.agency.findUnique({
    where: { id: ctx.user.agencyId },
    select: { timezone: true, currency: true },
  });
  const timezone = agency?.timezone ?? "Africa/Casablanca";
  const currency = agency?.currency ?? "MAD";
  const today = agencyDayBounds(new Date(), timezone);

  const status = first(rawParams, "status") as ReservationStatus | "";
  const bucket = first(rawParams, "bucket") as
    | "awaiting"
    | "today_pickup"
    | "today_return"
    | "open"
    | "";
  const q = first(rawParams, "q");

  const [reservations, counts] = await Promise.all([
    listReservations(ctx.db, { status, bucket, q: q || undefined }, today),
    countReservationsByStatus(ctx.db),
  ]);

  const base = `/${slug}/dashboard/reservations`;
  const chipHref = (value: string) =>
    value ? `${base}?status=${value}` : base;

  const buckets = [
    { key: "awaiting", label: "Awaiting call" },
    { key: "today_pickup", label: "Pickups today" },
    { key: "today_return", label: "Returns today" },
    { key: "open", label: "All open" },
  ];

  return (
    <>
      <PageHeader
        title="Reservations"
        description={`${counts.OPEN ?? 0} open · ${counts.ALL ?? 0} total`}
      />

      {/* Operational buckets first — these are what staff open the page for */}
      <div className="no-scrollbar -mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {buckets.map((item) => (
            <Link
              key={item.key}
              href={`${base}?bucket=${item.key}`}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                bucket === item.key
                  ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border-line bg-surface text-ink-soft hover:border-line-strong"
              }`}
            >
              {item.label}
              {item.key === "awaiting" && counts.AWAITING_CONFIRMATION ? (
                <span className="ms-2 rounded-full bg-caution-soft px-1.5 text-xs text-caution tabular-nums">
                  {counts.AWAITING_CONFIRMATION}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          <Link
            href={base}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              !status && !bucket
                ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-line bg-surface text-ink-muted hover:border-line-strong"
            }`}
          >
            All ({counts.ALL ?? 0})
          </Link>
          {CHIP_STATUSES.map((value) => (
            <Link
              key={value}
              href={chipHref(value)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                status === value
                  ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border-line bg-surface text-ink-muted hover:border-line-strong"
              }`}
            >
              {RESERVATION_STATUS_LABELS[value].label} ({counts[value] ?? 0})
            </Link>
          ))}
        </div>
      </div>

      <form method="get" action={base} className="mb-5">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {bucket ? <input type="hidden" name="bucket" value={bucket} /> : null}
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-muted">
            <IconSearch size={18} />
          </span>
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search reference, customer, phone or registration"
            className="ps-10"
            aria-label="Search reservations"
          />
        </div>
      </form>

      {reservations.length === 0 ? (
        <EmptyState
          icon={<IconClipboard />}
          title={q ? "No reservations match" : "No reservations yet"}
          description={
            q
              ? "Try a different reference, name or phone number."
              : "Bookings from your website appear here the moment they are made, waiting for your confirmation call."
          }
        />
      ) : (
        <ul className="space-y-2">
          {reservations.map((reservation) => {
            const cover = reservation.vehicle.images[0]?.file.publicUrl;
            const owing = Number(reservation.amountRemaining) > 0;

            return (
              <li key={reservation.id}>
                <Link
                  href={`${base}/${reservation.id}`}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition hover:border-line-strong hover:shadow-sm"
                >
                  <div className="hidden h-14 w-20 shrink-0 overflow-hidden rounded-md bg-surface-sunken sm:block">
                    {cover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-ink">
                        {reservation.bookingReference}
                      </span>
                      <ReservationStatusBadge status={reservation.status} />
                      {owing ? (
                        <span className="text-xs font-medium text-caution">
                          {formatMoney(reservation.amountRemaining, currency)}{" "}
                          due
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-ink">
                      {reservation.customer.fullName} ·{" "}
                      {reservation.vehicle.brand} {reservation.vehicle.model}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {formatInTimezone(
                        reservation.pickupDatetime,
                        timezone,
                        "d MMM HH:mm",
                      )}
                      {" → "}
                      {formatInTimezone(
                        reservation.returnDatetime,
                        timezone,
                        "d MMM HH:mm",
                      )}
                      {" · "}
                      {reservation.pickupLocation.name}
                    </p>
                  </div>

                  <div className="shrink-0 text-end">
                    <p className="text-sm font-semibold text-ink tabular-nums">
                      {formatMoney(reservation.finalTotal, currency)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {reservation.rentalDays}d
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
