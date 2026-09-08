/**
 * Pure geometry for the fleet calendar (spec §65).
 *
 * A block is drawn as a bar across its vehicle's row. Its position is expressed
 * as percentages of the visible window so the same maths serves the day, week
 * and month views without any of them knowing about pixels.
 *
 * Kept free of React and Prisma so the arithmetic — which is where off-by-one
 * errors in calendars actually live — can be tested directly.
 */

export type CalendarView = "day" | "week" | "month";

export type Placement = {
  /** Percentage from the left edge of the window */
  leftPct: number;
  /** Percentage of the window's width */
  widthPct: number;
  /** The block starts before the window and is cut off at the left */
  clippedStart: boolean;
  /** The block ends after the window and is cut off at the right */
  clippedEnd: boolean;
};

/**
 * Place an interval inside a window, clipping to the visible edges.
 * Returns null when the interval does not intersect the window at all.
 */
export function placeInWindow(
  start: Date,
  end: Date,
  windowStart: Date,
  windowEnd: Date,
): Placement | null {
  const windowMs = windowEnd.getTime() - windowStart.getTime();
  if (windowMs <= 0) return null;

  const startMs = start.getTime();
  const endMs = end.getTime();

  // Half-open: a block ending exactly at the window start is not visible.
  if (endMs <= windowStart.getTime() || startMs >= windowEnd.getTime()) {
    return null;
  }

  const clippedStart = startMs < windowStart.getTime();
  const clippedEnd = endMs > windowEnd.getTime();

  const visibleStart = clippedStart ? windowStart.getTime() : startMs;
  const visibleEnd = clippedEnd ? windowEnd.getTime() : endMs;

  const leftPct = ((visibleStart - windowStart.getTime()) / windowMs) * 100;
  const widthPct = ((visibleEnd - visibleStart) / windowMs) * 100;

  return {
    leftPct,
    // Keep a hairline visible for very short blocks so they can still be tapped.
    widthPct: Math.max(widthPct, 0.6),
    clippedStart,
    clippedEnd,
  };
}

/** How many columns a view shows, and how wide each one is. */
export function columnCount(view: CalendarView, windowStart: Date, windowEnd: Date): number {
  if (view === "day") return 24;
  const days = Math.round(
    (windowEnd.getTime() - windowStart.getTime()) / 86_400_000,
  );
  return Math.max(1, days);
}
