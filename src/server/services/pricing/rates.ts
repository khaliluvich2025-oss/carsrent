import { TZDate } from "@date-fns/tz";

import { money } from "@/lib/money";
import type { SeasonalRate, SelectedRate, VehicleRates } from "./types";

/** Days at which the duration tiers kick in (spec §24). */
export const WEEKLY_THRESHOLD_DAYS = 7;
export const MONTHLY_THRESHOLD_DAYS = 30;

/**
 * The calendar day a rental starts on, in the agency's timezone, as a UTC
 * midnight instant — the same shape `seasonal_rates.start_date` is stored in, so
 * the two can be compared directly.
 */
function localCalendarDay(instant: Date, timezone: string): Date {
  const local = new TZDate(instant, timezone);
  return new Date(
    Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()),
  );
}

/**
 * Find the season covering the pickup date, if any. Highest `priority` wins when
 * two seasons overlap; ties break on the later start, so a specific short season
 * beats a broad one it sits inside.
 */
export function findSeasonalRate(
  pickupAt: Date,
  timezone: string,
  seasons: SeasonalRate[] = [],
): SeasonalRate | null {
  const day = localCalendarDay(pickupAt, timezone).getTime();

  const matches = seasons.filter(
    (season) =>
      season.startDate.getTime() <= day && season.endDate.getTime() >= day,
  );

  if (matches.length === 0) return null;

  return matches.reduce((best, candidate) => {
    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best;
    }
    return candidate.startDate.getTime() > best.startDate.getTime()
      ? candidate
      : best;
  });
}

/**
 * Pick the daily rate for a rental (spec §24, §25).
 *
 * Order: season → monthly → weekly → daily. A season beats the duration tiers on
 * purpose — peak-season pricing is the agency's answer to demand, and a long
 * booking in August should not quietly undercut it.
 */
export function selectDailyRate(input: {
  vehicle: VehicleRates;
  billableDays: number;
  pickupAt: Date;
  timezone: string;
  seasonalRates?: SeasonalRate[];
}): SelectedRate {
  const season = findSeasonalRate(
    input.pickupAt,
    input.timezone,
    input.seasonalRates,
  );

  if (season) {
    return {
      source: "SEASONAL",
      dailyRate: money(season.dailyPrice).toFixed(2),
      seasonName: season.name,
    };
  }

  if (
    input.billableDays >= MONTHLY_THRESHOLD_DAYS &&
    input.vehicle.monthlyPrice != null
  ) {
    return {
      source: "MONTHLY",
      dailyRate: money(input.vehicle.monthlyPrice).toFixed(2),
    };
  }

  if (
    input.billableDays >= WEEKLY_THRESHOLD_DAYS &&
    input.vehicle.weeklyPrice != null
  ) {
    return {
      source: "WEEKLY",
      dailyRate: money(input.vehicle.weeklyPrice).toFixed(2),
    };
  }

  return {
    source: "DAILY",
    dailyRate: money(input.vehicle.dailyPrice).toFixed(2),
  };
}
