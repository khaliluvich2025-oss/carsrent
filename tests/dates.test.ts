import { describe, expect, it } from "vitest";

import {
  agencyDayBounds,
  agencyDayOfWeek,
  durationMinutes,
  formatInTimezone,
  intervalsOverlap,
  wallClockToInstant,
  withBuffer,
} from "@/lib/dates";

const TZ = "Africa/Casablanca";
const iso = (s: string) => new Date(s);

/** spec §19, §21, §93 */
describe("interval overlap", () => {
  const start = iso("2026-09-12T10:00:00Z");
  const end = iso("2026-09-15T10:00:00Z");

  it("detects an identical window", () => {
    expect(intervalsOverlap(start, end, start, end)).toBe(true);
  });

  it("detects partial overlap from either side", () => {
    expect(
      intervalsOverlap(
        start,
        end,
        iso("2026-09-14T10:00:00Z"),
        iso("2026-09-17T10:00:00Z"),
      ),
    ).toBe(true);

    expect(
      intervalsOverlap(
        start,
        end,
        iso("2026-09-10T10:00:00Z"),
        iso("2026-09-13T10:00:00Z"),
      ),
    ).toBe(true);
  });

  it("detects full containment in both directions", () => {
    expect(
      intervalsOverlap(
        start,
        end,
        iso("2026-09-13T10:00:00Z"),
        iso("2026-09-14T10:00:00Z"),
      ),
    ).toBe(true);

    expect(
      intervalsOverlap(
        iso("2026-09-13T10:00:00Z"),
        iso("2026-09-14T10:00:00Z"),
        start,
        end,
      ),
    ).toBe(true);
  });

  it("treats touching intervals as free, so back-to-back rentals are legal", () => {
    expect(
      intervalsOverlap(start, end, end, iso("2026-09-18T10:00:00Z")),
    ).toBe(false);

    expect(
      intervalsOverlap(start, end, iso("2026-09-09T10:00:00Z"), start),
    ).toBe(false);
  });

  it("reports disjoint windows as free", () => {
    expect(
      intervalsOverlap(
        start,
        end,
        iso("2026-09-20T10:00:00Z"),
        iso("2026-09-22T10:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("buffer between rentals (spec §21)", () => {
  // Return 14 Sep 18:00, buffer 2h -> next pickup possible from 20:00.
  const ret = iso("2026-09-14T18:00:00Z");
  const blockedUntil = withBuffer(ret, 120);

  it("pushes the block out by the buffer", () => {
    expect(blockedUntil.toISOString()).toBe("2026-09-14T20:00:00.000Z");
  });

  it("rejects a pickup inside the buffer", () => {
    expect(
      intervalsOverlap(
        iso("2026-09-14T19:00:00Z"),
        iso("2026-09-16T10:00:00Z"),
        ret,
        blockedUntil,
      ),
    ).toBe(true);
  });

  it("allows a pickup at exactly return + buffer", () => {
    expect(
      intervalsOverlap(
        iso("2026-09-14T20:00:00Z"),
        iso("2026-09-16T10:00:00Z"),
        ret,
        blockedUntil,
      ),
    ).toBe(false);
  });

  it("is a no-op at zero", () => {
    expect(withBuffer(ret, 0).getTime()).toBe(ret.getTime());
  });
});

describe("timezone handling (spec §93)", () => {
  it("reads an operator's wall-clock time in the agency timezone", () => {
    // Africa/Casablanca is UTC+1 in September (DST in force).
    const instant = wallClockToInstant("2026-09-12", "10:00", TZ);
    expect(instant.toISOString()).toBe("2026-09-12T09:00:00.000Z");
  });

  it("round-trips a wall-clock time through formatting", () => {
    const instant = wallClockToInstant("2026-09-12", "18:00", TZ);
    expect(formatInTimezone(instant, TZ, "yyyy-MM-dd HH:mm")).toBe(
      "2026-09-12 18:00",
    );
  });

  it("distinguishes two times on the same day", () => {
    const morning = wallClockToInstant("2026-09-12", "10:00", TZ);
    const evening = wallClockToInstant("2026-09-12", "18:00", TZ);
    expect(durationMinutes(morning, evening)).toBe(480);
  });

  it("brackets the agency's day correctly across a month boundary", () => {
    const lastMoment = wallClockToInstant("2026-09-30", "23:30", TZ);
    const { start, end } = agencyDayBounds(lastMoment, TZ);

    expect(formatInTimezone(start, TZ, "yyyy-MM-dd HH:mm")).toBe(
      "2026-09-30 00:00",
    );
    expect(formatInTimezone(end, TZ, "yyyy-MM-dd HH:mm")).toBe(
      "2026-10-01 00:00",
    );
    expect(lastMoment >= start && lastMoment < end).toBe(true);
  });

  it("keeps a just-before-midnight instant inside the right day", () => {
    const instant = wallClockToInstant("2026-09-12", "23:59", TZ);
    const { start, end } = agencyDayBounds(instant, TZ);
    expect(instant >= start && instant < end).toBe(true);
  });

  it("reports the agency-local day of week for working hours", () => {
    // 2026-09-12 is a Saturday.
    expect(agencyDayOfWeek(wallClockToInstant("2026-09-12", "12:00", TZ), TZ)).toBe(6);
    expect(agencyDayOfWeek(wallClockToInstant("2026-09-13", "12:00", TZ), TZ)).toBe(0);
  });
});
