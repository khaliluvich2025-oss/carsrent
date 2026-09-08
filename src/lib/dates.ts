import { TZDate } from "@date-fns/tz";
import { addMinutes, differenceInMinutes, format } from "date-fns";

/**
 * Date and time handling (spec §93).
 *
 * A rental instant is always an absolute point in time stored as `timestamptz`.
 * The agency timezone is used for two things only: rendering, and interpreting
 * a wall-clock time an operator typed. Overlap arithmetic is never done in local
 * time, which is what keeps midnight, month-end and DST out of the correctness
 * story.
 */

export const DEFAULT_TIMEZONE = "Africa/Casablanca";

/**
 * The core availability predicate (spec §19):
 *
 *   requested_start < existing_end AND requested_end > existing_start
 *
 * Half-open intervals: an interval ending exactly when another starts does NOT
 * overlap, which is what makes back-to-back rentals legal once the buffer has
 * been applied.
 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/** Apply the agency's turnaround buffer to the end of a window (spec §21). */
export function withBuffer(end: Date, bufferMinutes: number): Date {
  return bufferMinutes > 0 ? addMinutes(end, bufferMinutes) : new Date(end);
}

export function durationMinutes(start: Date, end: Date): number {
  return differenceInMinutes(end, start);
}

/**
 * Turn a wall-clock date and time an operator entered ("12 Sep", "10:00") into
 * the absolute instant it denotes in the agency's timezone.
 */
export function wallClockToInstant(
  isoDate: string,
  time: string,
  timezone = DEFAULT_TIMEZONE,
): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (
    [year, month, day, hour, minute].some((n) => !Number.isFinite(n))
  ) {
    throw new Error(`Invalid wall-clock input: "${isoDate}" "${time}"`);
  }

  return new Date(
    new TZDate(year, month - 1, day, hour, minute, 0, 0, timezone).getTime(),
  );
}

/** Render an instant in the agency's timezone. */
export function formatInTimezone(
  instant: Date,
  timezone = DEFAULT_TIMEZONE,
  pattern = "dd MMM yyyy HH:mm",
): string {
  return format(new TZDate(instant, timezone), pattern);
}

export function formatDateInTimezone(
  instant: Date,
  timezone = DEFAULT_TIMEZONE,
): string {
  return formatInTimezone(instant, timezone, "dd MMM yyyy");
}

export function formatTimeInTimezone(
  instant: Date,
  timezone = DEFAULT_TIMEZONE,
): string {
  return formatInTimezone(instant, timezone, "HH:mm");
}

/** Start and end of the agency's "today", as absolute instants. */
export function agencyDayBounds(
  instant: Date,
  timezone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const local = new TZDate(instant, timezone);
  const start = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    0,
    0,
    0,
    0,
    timezone,
  );
  const end = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + 1,
    0,
    0,
    0,
    0,
    timezone,
  );
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/**
 * The agency-local week containing `instant`, as absolute instants.
 * Weeks start on Monday — the working week agencies plan around.
 */
export function agencyWeekBounds(
  instant: Date,
  timezone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const local = new TZDate(instant, timezone);
  // getDay(): 0 = Sunday. Shift so Monday is the first day.
  const offsetToMonday = (local.getDay() + 6) % 7;

  const start = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() - offsetToMonday,
    0,
    0,
    0,
    0,
    timezone,
  );
  const end = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() - offsetToMonday + 7,
    0,
    0,
    0,
    0,
    timezone,
  );

  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** The agency-local calendar month containing `instant`. */
export function agencyMonthBounds(
  instant: Date,
  timezone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const local = new TZDate(instant, timezone);

  const start = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    1,
    0,
    0,
    0,
    0,
    timezone,
  );
  const end = new TZDate(
    local.getFullYear(),
    local.getMonth() + 1,
    1,
    0,
    0,
    0,
    0,
    timezone,
  );

  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** Shift an instant by whole agency-local days, preserving wall-clock time. */
export function addAgencyDays(
  instant: Date,
  days: number,
  timezone = DEFAULT_TIMEZONE,
): Date {
  const local = new TZDate(instant, timezone);
  return new Date(
    new TZDate(
      local.getFullYear(),
      local.getMonth(),
      local.getDate() + days,
      local.getHours(),
      local.getMinutes(),
      0,
      0,
      timezone,
    ).getTime(),
  );
}

/** Shift an instant by whole agency-local months. */
export function addAgencyMonths(
  instant: Date,
  months: number,
  timezone = DEFAULT_TIMEZONE,
): Date {
  const local = new TZDate(instant, timezone);
  return new Date(
    new TZDate(
      local.getFullYear(),
      local.getMonth() + months,
      1,
      0,
      0,
      0,
      0,
      timezone,
    ).getTime(),
  );
}

/** Day of week (0 = Sunday) in the agency timezone, for working-hours lookups. */
export function agencyDayOfWeek(
  instant: Date,
  timezone = DEFAULT_TIMEZONE,
): number {
  return new TZDate(instant, timezone).getDay();
}
