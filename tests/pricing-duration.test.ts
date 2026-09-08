import { describe, expect, it } from "vitest";

import { computeDuration } from "@/server/services/pricing";
import type { BillingSettings } from "@/server/services/pricing";

const at = (iso: string) => new Date(iso);

const roundUp: BillingSettings = {
  rule: "DAY_ROUND_UP",
  gracePeriodMinutes: 60,
  extraHourPrice: "80.00",
};
const grace: BillingSettings = {
  rule: "GRACE_PERIOD",
  gracePeriodMinutes: 60,
  extraHourPrice: "80.00",
};
const hourly: BillingSettings = {
  rule: "EXTRA_HOURLY",
  gracePeriodMinutes: 60,
  extraHourPrice: "80.00",
};

/** spec §27 */
describe("rental duration", () => {
  it("charges exact multiples of 24h as whole days under every rule", () => {
    const from = at("2026-09-12T10:00:00Z");
    const to = at("2026-09-17T10:00:00Z");

    for (const billing of [roundUp, grace, hourly]) {
      const d = computeDuration(from, to, billing);
      expect(d.billableDays, billing.rule).toBe(5);
      expect(d.extraHours, billing.rule).toBe(0);
      expect(d.overrunMinutes, billing.rule).toBe(0);
    }
  });

  describe("the spec §27 worked example", () => {
    // Pickup Monday 10:00, return Tuesday 10:45, grace 60 -> charged 1 day
    const from = at("2026-09-14T10:00:00Z");
    const to = at("2026-09-15T10:45:00Z");

    it("forgives the 45 minute overrun under GRACE_PERIOD", () => {
      const d = computeDuration(from, to, grace);
      expect(d.billableDays).toBe(1);
      expect(d.gracedMinutes).toBe(45);
      expect(d.extraHours).toBe(0);
    });

    it("forgives it under EXTRA_HOURLY too", () => {
      const d = computeDuration(from, to, hourly);
      expect(d.billableDays).toBe(1);
      expect(d.extraHours).toBe(0);
    });

    it("still charges a second day under DAY_ROUND_UP", () => {
      expect(computeDuration(from, to, roundUp).billableDays).toBe(2);
    });
  });

  describe("overrun beyond the grace period", () => {
    // 1 day + 2h30m
    const from = at("2026-09-14T10:00:00Z");
    const to = at("2026-09-15T12:30:00Z");

    it("rounds up to a whole day under GRACE_PERIOD", () => {
      const d = computeDuration(from, to, grace);
      expect(d.billableDays).toBe(2);
      expect(d.extraHours).toBe(0);
    });

    it("charges started hours past the grace under EXTRA_HOURLY", () => {
      const d = computeDuration(from, to, hourly);
      expect(d.billableDays).toBe(1);
      // 150 minutes overrun - 60 grace = 90 minutes -> 2 started hours
      expect(d.extraHours).toBe(2);
      expect(d.gracedMinutes).toBe(60);
    });

    it("rounds up under DAY_ROUND_UP", () => {
      expect(computeDuration(from, to, roundUp).billableDays).toBe(2);
    });
  });

  it("charges exactly the grace boundary as free", () => {
    const from = at("2026-09-14T10:00:00Z");
    const to = at("2026-09-15T11:00:00Z"); // exactly 60 minutes over

    expect(computeDuration(from, to, grace).billableDays).toBe(1);
    expect(computeDuration(from, to, hourly).extraHours).toBe(0);
  });

  it("charges one minute past the grace", () => {
    const from = at("2026-09-14T10:00:00Z");
    const to = at("2026-09-15T11:01:00Z");

    expect(computeDuration(from, to, grace).billableDays).toBe(2);
    expect(computeDuration(from, to, hourly).extraHours).toBe(1);
  });

  it("never charges less than one day", () => {
    const from = at("2026-09-14T10:00:00Z");
    const to = at("2026-09-14T14:00:00Z"); // 4 hours

    for (const billing of [roundUp, grace, hourly]) {
      const d = computeDuration(from, to, billing);
      expect(d.billableDays, billing.rule).toBe(1);
      expect(d.extraHours, billing.rule).toBe(0);
    }
  });

  it("treats a same-day rental just under 24h as one day", () => {
    const d = computeDuration(
      at("2026-09-14T10:00:00Z"),
      at("2026-09-15T09:00:00Z"),
      grace,
    );
    expect(d.billableDays).toBe(1);
  });

  it("handles a zero grace period", () => {
    const zeroGrace: BillingSettings = { ...grace, gracePeriodMinutes: 0 };
    const d = computeDuration(
      at("2026-09-14T10:00:00Z"),
      at("2026-09-15T10:01:00Z"),
      zeroGrace,
    );
    expect(d.billableDays).toBe(2);
  });

  it("crosses a month boundary without drift", () => {
    const d = computeDuration(
      at("2026-09-29T10:00:00Z"),
      at("2026-10-02T10:00:00Z"),
      grace,
    );
    expect(d.billableDays).toBe(3);
  });

  it("crosses midnight without inventing a day", () => {
    const d = computeDuration(
      at("2026-09-14T23:30:00Z"),
      at("2026-09-15T23:30:00Z"),
      grace,
    );
    expect(d.billableDays).toBe(1);
  });

  it("counts a long rental correctly", () => {
    const d = computeDuration(
      at("2026-09-01T10:00:00Z"),
      at("2026-10-01T10:00:00Z"),
      grace,
    );
    expect(d.billableDays).toBe(30);
  });

  it("reports a zero-length interval as zero days", () => {
    const same = at("2026-09-14T10:00:00Z");
    expect(computeDuration(same, same, grace).billableDays).toBe(0);
  });
});
