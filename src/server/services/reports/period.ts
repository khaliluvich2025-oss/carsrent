import { TZDate } from "@date-fns/tz";

import {
  agencyDayBounds,
  agencyMonthBounds,
  agencyWeekBounds,
} from "@/lib/dates";

/**
 * Report periods (spec §72).
 *
 * Every range is resolved in the agency's timezone and returned as absolute
 * instants, so "this month" means the agency's month rather than the server's.
 * `now` is injected so the resolution is testable without freezing the clock.
 */

export const PERIOD_KEYS = [
  "today",
  "week",
  "month",
  "year",
  "custom",
] as const;

export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type Period = {
  key: PeriodKey;
  start: Date;
  /** Exclusive */
  end: Date;
  label: string;
};

export function isPeriodKey(value: string): value is PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(value);
}

function agencyYearBounds(instant: Date, timezone: string) {
  const local = new TZDate(instant, timezone);
  const start = new TZDate(local.getFullYear(), 0, 1, 0, 0, 0, 0, timezone);
  const end = new TZDate(local.getFullYear() + 1, 0, 1, 0, 0, 0, 0, timezone);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolvePeriod(
  key: string,
  timezone: string,
  options: { from?: string; to?: string; now?: Date } = {},
): Period {
  const now = options.now ?? new Date();
  const periodKey: PeriodKey = isPeriodKey(key) ? key : "month";

  if (periodKey === "custom") {
    // A custom range needs both ends; anything else falls back rather than
    // silently reporting on a window nobody asked for.
    if (
      options.from &&
      options.to &&
      DATE.test(options.from) &&
      DATE.test(options.to) &&
      options.from <= options.to
    ) {
      const [fy, fm, fd] = options.from.split("-").map(Number);
      const [ty, tm, td] = options.to.split("-").map(Number);
      const start = new TZDate(fy, fm - 1, fd, 0, 0, 0, 0, timezone);
      // Inclusive end date: run to the start of the following day.
      const end = new TZDate(ty, tm - 1, td + 1, 0, 0, 0, 0, timezone);

      return {
        key: "custom",
        start: new Date(start.getTime()),
        end: new Date(end.getTime()),
        label: `${options.from} → ${options.to}`,
      };
    }
    return resolvePeriod("month", timezone, { now });
  }

  if (periodKey === "today") {
    const bounds = agencyDayBounds(now, timezone);
    return { key: "today", ...bounds, label: "Today" };
  }
  if (periodKey === "week") {
    const bounds = agencyWeekBounds(now, timezone);
    return { key: "week", ...bounds, label: "This week" };
  }
  if (periodKey === "year") {
    const bounds = agencyYearBounds(now, timezone);
    return { key: "year", ...bounds, label: "This year" };
  }

  const bounds = agencyMonthBounds(now, timezone);
  return { key: "month", ...bounds, label: "This month" };
}

/** Whole days spanned by a period, used as the denominator for utilisation. */
export function periodDays(period: Period): number {
  return Math.max(
    1,
    Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000),
  );
}
