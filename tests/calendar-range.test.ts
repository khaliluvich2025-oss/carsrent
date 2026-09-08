import { describe, expect, it } from "vitest";

import {
  addAgencyDays,
  addAgencyMonths,
  agencyMonthBounds,
  agencyWeekBounds,
  formatInTimezone,
} from "@/lib/dates";
import {
  columnCount,
  placeInWindow,
} from "@/server/services/availability/range";

const TZ = "Africa/Casablanca";
const at = (iso: string) => new Date(iso);

/** spec §65 */
describe("placing a block in the calendar window", () => {
  const start = at("2026-09-14T00:00:00Z");
  const end = at("2026-09-21T00:00:00Z"); // a 7-day window

  it("places a block that fills the whole window", () => {
    const placement = placeInWindow(start, end, start, end);
    expect(placement).not.toBeNull();
    expect(placement!.leftPct).toBeCloseTo(0);
    expect(placement!.widthPct).toBeCloseTo(100);
    expect(placement!.clippedStart).toBe(false);
    expect(placement!.clippedEnd).toBe(false);
  });

  it("places a one-day block on the correct day", () => {
    // The third day of a seven-day window
    const placement = placeInWindow(
      at("2026-09-16T00:00:00Z"),
      at("2026-09-17T00:00:00Z"),
      start,
      end,
    );
    expect(placement!.leftPct).toBeCloseTo((2 / 7) * 100);
    expect(placement!.widthPct).toBeCloseTo((1 / 7) * 100);
  });

  it("places a half-day block at the right offset", () => {
    const placement = placeInWindow(
      at("2026-09-14T12:00:00Z"),
      at("2026-09-15T00:00:00Z"),
      start,
      end,
    );
    expect(placement!.leftPct).toBeCloseTo((0.5 / 7) * 100);
    expect(placement!.widthPct).toBeCloseTo((0.5 / 7) * 100);
  });

  it("clips a block that starts before the window", () => {
    const placement = placeInWindow(
      at("2026-09-10T00:00:00Z"),
      at("2026-09-16T00:00:00Z"),
      start,
      end,
    );
    expect(placement!.leftPct).toBeCloseTo(0);
    expect(placement!.widthPct).toBeCloseTo((2 / 7) * 100);
    expect(placement!.clippedStart).toBe(true);
    expect(placement!.clippedEnd).toBe(false);
  });

  it("clips a block that ends after the window", () => {
    const placement = placeInWindow(
      at("2026-09-19T00:00:00Z"),
      at("2026-09-30T00:00:00Z"),
      start,
      end,
    );
    expect(placement!.leftPct).toBeCloseTo((5 / 7) * 100);
    expect(placement!.widthPct).toBeCloseTo((2 / 7) * 100);
    expect(placement!.clippedEnd).toBe(true);
  });

  it("clips a block that spans the whole window and beyond", () => {
    const placement = placeInWindow(
      at("2026-09-01T00:00:00Z"),
      at("2026-10-01T00:00:00Z"),
      start,
      end,
    );
    expect(placement!.leftPct).toBeCloseTo(0);
    expect(placement!.widthPct).toBeCloseTo(100);
    expect(placement!.clippedStart).toBe(true);
    expect(placement!.clippedEnd).toBe(true);
  });

  it("returns null for a block entirely before or after the window", () => {
    expect(
      placeInWindow(
        at("2026-09-01T00:00:00Z"),
        at("2026-09-05T00:00:00Z"),
        start,
        end,
      ),
    ).toBeNull();

    expect(
      placeInWindow(
        at("2026-09-25T00:00:00Z"),
        at("2026-09-28T00:00:00Z"),
        start,
        end,
      ),
    ).toBeNull();
  });

  it("treats a block touching the window edge as outside it", () => {
    // Ends exactly when the window starts
    expect(
      placeInWindow(at("2026-09-13T00:00:00Z"), start, start, end),
    ).toBeNull();
    // Starts exactly when the window ends
    expect(
      placeInWindow(end, at("2026-09-22T00:00:00Z"), start, end),
    ).toBeNull();
  });

  it("keeps a hairline width so very short blocks stay tappable", () => {
    const placement = placeInWindow(
      at("2026-09-16T00:00:00Z"),
      at("2026-09-16T00:05:00Z"),
      start,
      end,
    );
    expect(placement!.widthPct).toBeGreaterThanOrEqual(0.6);
  });

  it("refuses a window with no duration", () => {
    expect(placeInWindow(start, end, start, start)).toBeNull();
  });
});

describe("column counts", () => {
  it("uses 24 hours for the day view", () => {
    const start = at("2026-09-14T00:00:00Z");
    expect(columnCount("day", start, at("2026-09-15T00:00:00Z"))).toBe(24);
  });

  it("uses one column per day otherwise", () => {
    expect(
      columnCount("week", at("2026-09-14T00:00:00Z"), at("2026-09-21T00:00:00Z")),
    ).toBe(7);
    expect(
      columnCount("month", at("2026-09-01T00:00:00Z"), at("2026-10-01T00:00:00Z")),
    ).toBe(30);
  });
});

/** spec §93 — calendar windows are agency-local, stored as absolute instants */
describe("agency-local calendar windows", () => {
  it("starts the week on Monday", () => {
    // 2026-09-16 is a Wednesday
    const { start, end } = agencyWeekBounds(
      at("2026-09-16T12:00:00Z"),
      TZ,
    );
    expect(formatInTimezone(start, TZ, "EEE yyyy-MM-dd HH:mm")).toBe(
      "Mon 2026-09-14 00:00",
    );
    expect(formatInTimezone(end, TZ, "EEE yyyy-MM-dd HH:mm")).toBe(
      "Mon 2026-09-21 00:00",
    );
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // 2026-09-20 is a Sunday
    const { start } = agencyWeekBounds(at("2026-09-20T12:00:00Z"), TZ);
    expect(formatInTimezone(start, TZ, "yyyy-MM-dd")).toBe("2026-09-14");
  });

  it("brackets a calendar month", () => {
    const { start, end } = agencyMonthBounds(at("2026-09-16T12:00:00Z"), TZ);
    expect(formatInTimezone(start, TZ, "yyyy-MM-dd HH:mm")).toBe(
      "2026-09-01 00:00",
    );
    expect(formatInTimezone(end, TZ, "yyyy-MM-dd HH:mm")).toBe(
      "2026-10-01 00:00",
    );
  });

  it("brackets December into the next year", () => {
    const { end } = agencyMonthBounds(at("2026-12-16T12:00:00Z"), TZ);
    expect(formatInTimezone(end, TZ, "yyyy-MM-dd")).toBe("2027-01-01");
  });

  it("steps days across a month boundary", () => {
    const next = addAgencyDays(at("2026-09-30T10:00:00Z"), 1, TZ);
    expect(formatInTimezone(next, TZ, "yyyy-MM-dd")).toBe("2026-10-01");
  });

  it("steps months without overflowing", () => {
    const next = addAgencyMonths(at("2026-01-31T12:00:00Z"), 1, TZ);
    expect(formatInTimezone(next, TZ, "yyyy-MM-dd")).toBe("2026-02-01");
  });

  it("steps back across a year boundary", () => {
    const prev = addAgencyMonths(at("2026-01-15T12:00:00Z"), -1, TZ);
    expect(formatInTimezone(prev, TZ, "yyyy-MM")).toBe("2025-12");
  });
});
