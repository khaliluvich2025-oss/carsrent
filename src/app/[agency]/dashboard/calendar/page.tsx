import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import {
  addAgencyDays,
  addAgencyMonths,
  agencyDayBounds,
  formatInTimezone,
} from "@/lib/dates";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import {
  getFleetCalendar,
  resolveWindow,
} from "@/server/services/availability/calendar";
import type { CalendarView } from "@/server/services/availability/range";
import { createBlockAction, removeBlockAction } from "./actions";
import { BlockForm } from "./block-form";
import {
  CalendarGrid,
  type GridBlock,
  type GridColumn,
} from "./calendar-grid";

export const metadata: Metadata = { title: "Calendar" };

const VIEWS: CalendarView[] = ["day", "week", "month"];

function parseView(value: string | undefined): CalendarView {
  return VIEWS.includes(value as CalendarView)
    ? (value as CalendarView)
    : "week";
}

function parseAnchor(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ agency: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ agency: slug }, rawParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const ctx = await requirePermission("calendar.view");

  const first = (key: string) => {
    const value = rawParams[key];
    return (Array.isArray(value) ? value[0] : value) ?? undefined;
  };

  const agency = await db.agency.findUnique({
    where: { id: ctx.user.agencyId },
    select: { timezone: true },
  });
  const timezone = agency?.timezone ?? "Africa/Casablanca";

  const view = parseView(first("view"));
  const anchor = parseAnchor(first("date"));
  const window = resolveWindow(view, anchor, timezone);

  const { vehicles, blocks } = await getFleetCalendar(ctx.db, window);

  // Column headers, built in agency-local time.
  const columns: GridColumn[] = [];
  const todayBounds = agencyDayBounds(new Date(), timezone);

  if (view === "day") {
    for (let hour = 0; hour < 24; hour += 1) {
      columns.push({
        label: String(hour).padStart(2, "0"),
        isToday: false,
      });
    }
  } else {
    const dayCount = Math.round(
      (window.end.getTime() - window.start.getTime()) / 86_400_000,
    );
    for (let index = 0; index < dayCount; index += 1) {
      const day = new Date(window.start.getTime() + index * 86_400_000);
      columns.push({
        label: formatInTimezone(day, timezone, "d"),
        sublabel:
          view === "week" ? formatInTimezone(day, timezone, "EEE") : undefined,
        isToday: day.getTime() === todayBounds.start.getTime(),
      });
    }
  }

  const gridBlocks: GridBlock[] = blocks.map((block) => ({
    id: block.id,
    vehicleId: block.vehicleId,
    kind: block.kind,
    startsAt: block.startsAt.toISOString(),
    endsAt: block.endsAt.toISOString(),
    bufferMinutes: block.bufferMinutes,
    label: block.label,
    detail: block.detail,
    bookingReference: block.bookingReference,
    customerName: block.customerName,
    reservationStatus: block.reservationStatus,
    removable: block.removable,
    startLabel: formatInTimezone(block.startsAt, timezone),
    endLabel: formatInTimezone(block.endsAt, timezone),
  }));

  // Navigation
  const step = view === "month" ? 0 : view === "week" ? 7 : 1;
  const prevAnchor =
    view === "month"
      ? addAgencyMonths(window.start, -1, timezone)
      : addAgencyDays(anchor, -step, timezone);
  const nextAnchor =
    view === "month"
      ? addAgencyMonths(window.start, 1, timezone)
      : addAgencyDays(anchor, step, timezone);

  const base = `/${slug}/dashboard/calendar`;
  const link = (v: CalendarView, date: Date) =>
    `${base}?view=${v}&date=${isoDay(date)}`;

  const rangeLabel =
    view === "day"
      ? formatInTimezone(window.start, timezone, "EEEE d MMMM yyyy")
      : view === "week"
        ? `${formatInTimezone(window.start, timezone, "d MMM")} – ${formatInTimezone(new Date(window.end.getTime() - 1), timezone, "d MMM yyyy")}`
        : formatInTimezone(window.start, timezone, "MMMM yyyy");

  const canManage = ctx.can("maintenance.manage");

  const legend = [
    { label: "Reserved / rented", className: "bg-[var(--brand)]" },
    { label: "Maintenance", className: "bg-caution" },
    { label: "Manually blocked", className: "bg-ink-muted" },
    { label: "Checkout hold", className: "bg-line-strong" },
  ];

  return (
    <>
      <PageHeader
        title="Fleet calendar"
        description="Every reason a car is unavailable, from the same table the booking engine reads."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          {VIEWS.map((option) => (
            <Link
              key={option}
              href={link(option, anchor)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                view === option
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {option}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={link(view, prevAnchor)}
            aria-label="Previous period"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition hover:border-line-strong"
          >
            ‹
          </Link>
          <Link
            href={link(view, new Date())}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:border-line-strong"
          >
            Today
          </Link>
          <Link
            href={link(view, nextAnchor)}
            aria-label="Next period"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition hover:border-line-strong"
          >
            ›
          </Link>
        </div>
      </div>

      <p className="mb-3 text-sm font-semibold text-ink">{rangeLabel}</p>

      <CalendarGrid
        vehicles={vehicles}
        blocks={gridBlocks}
        columns={columns}
        windowStart={window.start.toISOString()}
        windowEnd={window.end.toISOString()}
        view={view}
        removeAction={removeBlockAction.bind(null, slug)}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {legend.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 text-xs text-ink-muted"
          >
            <span className={`h-2.5 w-4 rounded-sm ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>

      {canManage ? (
        <div className="mt-6">
          <BlockForm
            action={createBlockAction.bind(null, slug)}
            vehicles={vehicles.map((vehicle) => ({
              id: vehicle.id,
              label: `${vehicle.brand} ${vehicle.model} (${vehicle.registrationNumber})`,
            }))}
            defaultDate={isoDay(window.start)}
          />
        </div>
      ) : null}

      <p className="mt-6 text-xs text-ink-muted">
        Reserved bars include the agency turnaround buffer, which is why a car
        stays blocked for a while after its return time.
      </p>
    </>
  );
}
