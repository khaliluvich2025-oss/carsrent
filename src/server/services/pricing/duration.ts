import type { BillingSettings, Duration } from "./types";

const MINUTES_PER_DAY = 24 * 60;

/**
 * Rental duration in billable units (spec §27).
 *
 * A rental is measured as an elapsed interval, not a count of calendar dates —
 * 12 Sep 10:00 to 13 Sep 09:00 is under a day, and 12 Sep 18:00 to 13 Sep 19:00
 * is over one, even though both touch two dates (spec §93).
 *
 * Three agency policies:
 *
 *   DAY_ROUND_UP   any part of a day is a whole day
 *   GRACE_PERIOD   overrun within the grace is free; beyond it, a whole extra day
 *   EXTRA_HOURLY   overrun within the grace is free; beyond it, per started hour
 *
 * A rental always costs at least one day. Without that floor, EXTRA_HOURLY would
 * price a four-hour rental as four hours with no day at all, which is not what
 * "24 hours + extra hourly charge" means.
 */
export function computeDuration(
  pickupAt: Date,
  returnAt: Date,
  billing: BillingSettings,
): Duration {
  const totalMinutes = Math.max(
    0,
    Math.round((returnAt.getTime() - pickupAt.getTime()) / 60_000),
  );

  const fullDays = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const overrunMinutes = totalMinutes - fullDays * MINUTES_PER_DAY;

  const grace = Math.max(0, billing.gracePeriodMinutes);

  let billableDays: number;
  let extraHours = 0;
  let gracedMinutes = 0;

  switch (billing.rule) {
    case "DAY_ROUND_UP": {
      billableDays = overrunMinutes > 0 ? fullDays + 1 : fullDays;
      break;
    }

    case "GRACE_PERIOD": {
      if (overrunMinutes === 0) {
        billableDays = fullDays;
      } else if (overrunMinutes <= grace) {
        billableDays = fullDays;
        gracedMinutes = overrunMinutes;
      } else {
        billableDays = fullDays + 1;
      }
      break;
    }

    case "EXTRA_HOURLY": {
      billableDays = fullDays;
      if (overrunMinutes > 0 && overrunMinutes <= grace) {
        gracedMinutes = overrunMinutes;
      } else if (overrunMinutes > grace) {
        gracedMinutes = grace;
        // Part-hours are charged as whole hours.
        extraHours = Math.ceil((overrunMinutes - grace) / 60);
      }
      break;
    }
  }

  // Minimum one day for any rental with a positive duration.
  if (totalMinutes > 0 && billableDays < 1) {
    billableDays = 1;
    extraHours = 0;
    gracedMinutes = 0;
  }

  return {
    totalMinutes,
    fullDays,
    overrunMinutes,
    billableDays,
    extraHours,
    gracedMinutes,
  };
}
