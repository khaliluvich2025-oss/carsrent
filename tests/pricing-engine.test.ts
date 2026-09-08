import { describe, expect, it } from "vitest";

import { computeQuote, findSeasonalRate } from "@/server/services/pricing";
import type {
  BillingSettings,
  QuoteInput,
  SeasonalRate,
} from "@/server/services/pricing";

const TZ = "Africa/Casablanca";
const at = (iso: string) => new Date(iso);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const grace: BillingSettings = {
  rule: "GRACE_PERIOD",
  gracePeriodMinutes: 60,
  extraHourPrice: "80.00",
};

const duster = {
  dailyPrice: "450.00",
  weeklyPrice: "420.00",
  monthlyPrice: "350.00",
  securityDeposit: "3000.00",
};

function quote(overrides: Partial<QuoteInput> = {}) {
  return computeQuote({
    pickupAt: at("2026-09-12T10:00:00Z"),
    returnAt: at("2026-09-17T10:00:00Z"),
    vehicle: duster,
    billing: grace,
    timezone: TZ,
    currency: "MAD",
    ...overrides,
  });
}

describe("the spec §10 worked example", () => {
  // 5 days x 450 + 150 airport pickup = 2,400 MAD, deposit 3,000 separate
  const result = quote({ pickupFee: "150.00" });

  it("charges five days at the daily rate", () => {
    expect(result.duration.billableDays).toBe(5);
    expect(result.rate.source).toBe("DAILY");
    expect(result.baseAmount).toBe("2250.00");
  });

  it("adds the pickup fee", () => {
    expect(result.pickupFee).toBe("150.00");
  });

  it("totals 2,400", () => {
    expect(result.total).toBe("2400.00");
  });

  it("keeps the deposit out of the total", () => {
    expect(result.securityDeposit).toBe("3000.00");
    expect(result.total).toBe("2400.00");
  });
});

describe("rate tiers (spec §24)", () => {
  it("uses the daily rate under a week", () => {
    const result = quote({ returnAt: at("2026-09-15T10:00:00Z") });
    expect(result.rate.source).toBe("DAILY");
    expect(result.rate.dailyRate).toBe("450.00");
  });

  it("switches to the weekly rate at exactly 7 days", () => {
    const result = quote({ returnAt: at("2026-09-19T10:00:00Z") });
    expect(result.duration.billableDays).toBe(7);
    expect(result.rate.source).toBe("WEEKLY");
    expect(result.baseAmount).toBe("2940.00"); // 7 x 420
  });

  it("switches to the monthly rate at exactly 30 days", () => {
    const result = quote({ returnAt: at("2026-10-12T10:00:00Z") });
    expect(result.duration.billableDays).toBe(30);
    expect(result.rate.source).toBe("MONTHLY");
    expect(result.baseAmount).toBe("10500.00"); // 30 x 350
  });

  it("falls back to daily when no weekly rate is configured", () => {
    const result = quote({
      returnAt: at("2026-09-19T10:00:00Z"),
      vehicle: { ...duster, weeklyPrice: null },
    });
    expect(result.rate.source).toBe("DAILY");
    expect(result.baseAmount).toBe("3150.00"); // 7 x 450
  });

  it("falls back to weekly when no monthly rate is configured", () => {
    const result = quote({
      returnAt: at("2026-10-12T10:00:00Z"),
      vehicle: { ...duster, monthlyPrice: null },
    });
    expect(result.rate.source).toBe("WEEKLY");
  });
});

describe("seasonal rates (spec §24)", () => {
  const july: SeasonalRate = {
    name: "High season",
    startDate: day("2026-07-01"),
    endDate: day("2026-08-31"),
    dailyPrice: "600.00",
    priority: 0,
  };

  it("applies a season covering the pickup date", () => {
    const result = quote({
      pickupAt: at("2026-07-15T10:00:00Z"),
      returnAt: at("2026-07-20T10:00:00Z"),
      seasonalRates: [july],
    });
    expect(result.rate.source).toBe("SEASONAL");
    expect(result.rate.seasonName).toBe("High season");
    expect(result.baseAmount).toBe("3000.00"); // 5 x 600
  });

  it("beats the duration tiers, so peak pricing is not undercut", () => {
    const result = quote({
      pickupAt: at("2026-07-15T10:00:00Z"),
      returnAt: at("2026-07-25T10:00:00Z"), // 10 days, would normally be weekly
      seasonalRates: [july],
    });
    expect(result.rate.source).toBe("SEASONAL");
    expect(result.rate.dailyRate).toBe("600.00");
  });

  it("ignores a season the pickup date falls outside", () => {
    const result = quote({ seasonalRates: [july] });
    expect(result.rate.source).toBe("DAILY");
  });

  it("includes both boundary days", () => {
    expect(
      findSeasonalRate(at("2026-07-01T09:00:00Z"), TZ, [july]),
    ).not.toBeNull();
    expect(
      findSeasonalRate(at("2026-08-31T22:00:00Z"), TZ, [july]),
    ).not.toBeNull();
    expect(findSeasonalRate(at("2026-06-30T22:00:00Z"), TZ, [july])).toBeNull();
  });

  it("prefers the higher priority when seasons overlap", () => {
    const eid: SeasonalRate = {
      name: "Eid week",
      startDate: day("2026-07-10"),
      endDate: day("2026-07-17"),
      dailyPrice: "750.00",
      priority: 10,
    };
    const result = quote({
      pickupAt: at("2026-07-15T10:00:00Z"),
      returnAt: at("2026-07-18T10:00:00Z"),
      seasonalRates: [july, eid],
    });
    expect(result.rate.seasonName).toBe("Eid week");
    expect(result.rate.dailyRate).toBe("750.00");
  });

  it("uses the agency timezone to decide the pickup day", () => {
    // 30 Jun 23:30 UTC is already 1 Jul in Casablanca (UTC+1 in summer)
    const season: SeasonalRate = { ...july, priority: 0 };
    expect(
      findSeasonalRate(at("2026-06-30T23:30:00Z"), TZ, [season]),
    ).not.toBeNull();
  });
});

describe("fees, extras and discounts (spec §25)", () => {
  it("adds both location fees", () => {
    const result = quote({ pickupFee: "150.00", returnFee: "80.00" });
    expect(result.total).toBe("2480.00");
  });

  it("prices a flat extra once", () => {
    const result = quote({
      extras: [
        { name: "Child seat", priceType: "FLAT", unitPrice: "100.00", quantity: 1 },
      ],
    });
    expect(result.extrasAmount).toBe("100.00");
    expect(result.total).toBe("2350.00");
  });

  it("prices a per-day extra across the billable days", () => {
    const result = quote({
      extras: [
        { name: "GPS", priceType: "PER_DAY", unitPrice: "30.00", quantity: 1 },
      ],
    });
    expect(result.extrasAmount).toBe("150.00"); // 30 x 5 days
  });

  it("multiplies a per-day extra by quantity as well", () => {
    const result = quote({
      extras: [
        { name: "Child seat", priceType: "PER_DAY", unitPrice: "20.00", quantity: 2 },
      ],
    });
    expect(result.extrasAmount).toBe("200.00"); // 20 x 2 x 5
  });

  it("skips extras with zero quantity", () => {
    const result = quote({
      extras: [
        { name: "GPS", priceType: "FLAT", unitPrice: "100.00", quantity: 0 },
      ],
    });
    expect(result.extrasAmount).toBe("0.00");
    expect(result.lines.some((l) => l.kind === "EXTRA")).toBe(false);
  });

  it("subtracts a discount", () => {
    const result = quote({ discount: "250.00" });
    expect(result.discountAmount).toBe("250.00");
    expect(result.total).toBe("2000.00");
  });

  it("never lets a discount push the total below zero", () => {
    const result = quote({ discount: "99999.00" });
    expect(result.discountAmount).toBe("2250.00");
    expect(result.total).toBe("0.00");
  });
});

describe("hourly overrun billing (spec §27)", () => {
  const hourly: BillingSettings = {
    rule: "EXTRA_HOURLY",
    gracePeriodMinutes: 60,
    extraHourPrice: "80.00",
  };

  it("bills started hours past the grace on top of the days", () => {
    const result = quote({
      returnAt: at("2026-09-17T12:30:00Z"), // 5 days + 2h30m
      billing: hourly,
    });

    expect(result.duration.billableDays).toBe(5);
    expect(result.duration.extraHours).toBe(2);
    expect(result.baseAmount).toBe("2250.00");
    expect(result.extraHoursAmount).toBe("160.00");
    expect(result.total).toBe("2410.00");
  });

  it("does not add an extra-hours line when there is no overrun", () => {
    const result = quote({ billing: hourly });
    expect(result.extraHoursAmount).toBe("0.00");
    expect(result.lines.some((l) => l.kind === "EXTRA_HOURS")).toBe(false);
  });
});

describe("money handling (spec §94)", () => {
  it("returns strings, never numbers", () => {
    const result = quote();
    expect(typeof result.total).toBe("string");
    expect(typeof result.baseAmount).toBe("string");
    expect(typeof result.securityDeposit).toBe("string");
  });

  it("always carries two decimal places", () => {
    const result = quote({ pickupFee: "150.5" });
    for (const value of [result.total, result.baseAmount, result.pickupFee]) {
      expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it("does not accumulate floating point error over a long rental", () => {
    const result = quote({
      returnAt: at("2026-10-12T10:00:00Z"),
      vehicle: { ...duster, monthlyPrice: "333.33" },
    });
    expect(result.baseAmount).toBe("9999.90"); // 30 x 333.33 exactly
  });

  it("is deterministic", () => {
    expect(JSON.stringify(quote())).toBe(JSON.stringify(quote()));
  });
});

describe("quote breakdown", () => {
  it("itemises every charge for display", () => {
    const result = quote({
      pickupFee: "150.00",
      returnFee: "80.00",
      discount: "100.00",
      extras: [
        { name: "GPS", priceType: "PER_DAY", unitPrice: "30.00", quantity: 1 },
      ],
    });

    expect(result.lines.map((l) => l.kind)).toEqual([
      "BASE",
      "PICKUP_FEE",
      "RETURN_FEE",
      "EXTRA",
      "DISCOUNT",
    ]);
    expect(result.lines[0].detail).toContain("5 days");
  });

  it("omits zero-value fee lines", () => {
    const result = quote();
    expect(result.lines.map((l) => l.kind)).toEqual(["BASE"]);
  });
});

describe("guards", () => {
  it("refuses a return that is not after pickup", () => {
    expect(() =>
      quote({
        pickupAt: at("2026-09-12T10:00:00Z"),
        returnAt: at("2026-09-12T10:00:00Z"),
      }),
    ).toThrow();

    expect(() =>
      quote({
        pickupAt: at("2026-09-12T10:00:00Z"),
        returnAt: at("2026-09-11T10:00:00Z"),
      }),
    ).toThrow();
  });
});
