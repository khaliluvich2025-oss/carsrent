import { describe, expect, it } from "vitest";

import { formatInTimezone } from "@/lib/dates";
import {
  computeAverageBookingValue,
  computeAverageDuration,
  computeNetContribution,
  computeRepeatRate,
  computeUtilization,
  formatPercent,
  rankCounts,
  safeRate,
} from "@/server/services/reports/calculations";
import {
  csvFilename,
  escapeCsvField,
  toCsv,
} from "@/server/services/reports/csv";
import { periodDays, resolvePeriod } from "@/server/services/reports/period";
import {
  renderTemplate,
  TEMPLATES,
  whatsappLink,
} from "@/server/services/notifications/templates";

const TZ = "Africa/Casablanca";
const NOW = new Date("2026-09-16T12:00:00Z");

/** spec §72 */
describe("report periods", () => {
  it("resolves today in the agency timezone", () => {
    const period = resolvePeriod("today", TZ, { now: NOW });
    expect(formatInTimezone(period.start, TZ, "yyyy-MM-dd HH:mm")).toBe(
      "2026-09-16 00:00",
    );
    expect(formatInTimezone(period.end, TZ, "yyyy-MM-dd HH:mm")).toBe(
      "2026-09-17 00:00",
    );
  });

  it("resolves the week starting Monday", () => {
    const period = resolvePeriod("week", TZ, { now: NOW });
    expect(formatInTimezone(period.start, TZ, "EEE yyyy-MM-dd")).toBe(
      "Mon 2026-09-14",
    );
    expect(periodDays(period)).toBe(7);
  });

  it("resolves the calendar month", () => {
    const period = resolvePeriod("month", TZ, { now: NOW });
    expect(formatInTimezone(period.start, TZ, "yyyy-MM-dd")).toBe("2026-09-01");
    expect(formatInTimezone(period.end, TZ, "yyyy-MM-dd")).toBe("2026-10-01");
    expect(periodDays(period)).toBe(30);
  });

  it("resolves the calendar year", () => {
    const period = resolvePeriod("year", TZ, { now: NOW });
    expect(formatInTimezone(period.start, TZ, "yyyy-MM-dd")).toBe("2026-01-01");
    expect(formatInTimezone(period.end, TZ, "yyyy-MM-dd")).toBe("2027-01-01");
  });

  it("treats a custom range's end date as inclusive", () => {
    const period = resolvePeriod("custom", TZ, {
      from: "2026-09-01",
      to: "2026-09-07",
      now: NOW,
    });
    expect(periodDays(period)).toBe(7);
    expect(formatInTimezone(period.end, TZ, "yyyy-MM-dd")).toBe("2026-09-08");
  });

  it("falls back to the month rather than inventing a custom range", () => {
    for (const options of [
      { from: "2026-09-01" },
      { to: "2026-09-07" },
      { from: "bad", to: "worse" },
      { from: "2026-09-07", to: "2026-09-01" },
    ]) {
      const period = resolvePeriod("custom", TZ, { ...options, now: NOW });
      expect(period.key).toBe("month");
    }
  });

  it("falls back to the month for an unknown key", () => {
    expect(resolvePeriod("decade", TZ, { now: NOW }).key).toBe("month");
  });
});

/** spec §62, §69, §71 */
describe("report calculations", () => {
  it("computes utilisation as rented over available vehicle-days", () => {
    const result = computeUtilization({
      rentedDays: 45,
      vehicleCount: 3,
      periodDays: 30,
    });
    expect(result.availableDays).toBe(90);
    expect(result.rate).toBeCloseTo(0.5);
  });

  it("reports zero utilisation rather than dividing by zero", () => {
    expect(
      computeUtilization({ rentedDays: 0, vehicleCount: 0, periodDays: 30 })
        .rate,
    ).toBe(0);
  });

  it("computes net contribution as revenue less direct expenses", () => {
    expect(
      computeNetContribution({ revenue: "12000.00", directExpenses: "3250.00" }),
    ).toBe("8750.00");
  });

  it("reports a negative net contribution rather than clamping it", () => {
    // A car that cost more than it earned is exactly what the owner needs to see.
    expect(
      computeNetContribution({ revenue: "1000.00", directExpenses: "4000.00" }),
    ).toBe("-3000.00");
  });

  it("computes the average booking value", () => {
    expect(computeAverageBookingValue("9000.00", 4)).toBe("2250.00");
  });

  it("returns zero average when there are no bookings", () => {
    expect(computeAverageBookingValue("0", 0)).toBe("0.00");
  });

  it("computes the repeat-customer rate", () => {
    const result = computeRepeatRate([1, 1, 3, 2, 1]);
    expect(result.repeat).toBe(2);
    expect(result.total).toBe(5);
    expect(result.rate).toBeCloseTo(0.4);
  });

  it("handles no customers at all", () => {
    expect(computeRepeatRate([]).rate).toBe(0);
  });

  it("computes average duration to one decimal", () => {
    expect(computeAverageDuration([3, 4, 5])).toBe(4);
    expect(computeAverageDuration([3, 4])).toBe(3.5);
    expect(computeAverageDuration([])).toBe(0);
  });

  it("guards every rate against a zero denominator", () => {
    expect(safeRate(5, 0)).toBe(0);
    expect(safeRate(0, 0)).toBe(0);
  });

  it("formats a rate as a percentage", () => {
    expect(formatPercent(0.725)).toBe("73%");
    expect(formatPercent(0.725, 1)).toBe("72.5%");
  });

  it("ranks counts highest first and limits the result", () => {
    const ranked = rankCounts(
      [
        { label: "a", count: 2 },
        { label: "b", count: 9 },
        { label: "c", count: 5 },
      ],
      2,
    );
    expect(ranked.map((row) => row.label)).toEqual(["b", "c"]);
  });
});

/** spec §73 */
describe("CSV export", () => {
  it("writes a header and rows", () => {
    const csv = toCsv([{ name: "Clio", price: 280 }], [
      { header: "Name", value: (r) => r.name },
      { header: "Price", value: (r) => r.price },
    ]);
    expect(csv).toBe("Name,Price\r\nClio,280");
  });

  it("quotes fields containing a comma, quote or newline", () => {
    expect(escapeCsvField("Marrakech, Morocco")).toBe('"Marrakech, Morocco"');
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("neutralises spreadsheet formula injection", () => {
    // A note starting with = must arrive as text, not be evaluated by Excel.
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvField("-2")).toBe("'-2");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
  });

  it("renders empty for null and undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("builds a safe filename", () => {
    expect(csvFilename("payments", "2026-09-01 → 2026-09-07")).toBe(
      "payments-2026-09-01-2026-09-07.csv",
    );
  });
});

/** spec §68 */
describe("message templates", () => {
  const variables = {
    customerName: "Marie",
    agencyName: "Atlas Cars",
    reference: "RNT-ACDEFG",
    vehicle: "Dacia Duster",
    pickupAt: "Sat 12 Sep, 10:00",
    returnAt: "Thu 17 Sep, 10:00",
    pickupLocation: "Marrakech Airport",
    returnLocation: "Agency Office",
    total: "2 400,00 MAD",
    outstanding: "0,00 MAD",
    agencyPhone: "+212 524 000 000",
  };

  it("substitutes every variable in every template", () => {
    for (const template of TEMPLATES) {
      const rendered = renderTemplate(template.body, variables);
      expect(rendered, template.key).not.toMatch(/\{\w+\}/);
    }
  });

  it("never leaks a raw placeholder when a variable is missing", () => {
    const rendered = renderTemplate("Hello {customerName}, ref {reference}", {});
    expect(rendered).toBe("Hello —, ref —");
  });

  it("treats an empty variable as missing", () => {
    expect(renderTemplate("Call {agencyPhone}", { agencyPhone: "  " })).toBe(
      "Call —",
    );
  });

  it("builds a wa.me link with the message encoded", () => {
    const link = whatsappLink("212661234567", "Hello Marie & co");
    expect(link).toContain("https://wa.me/212661234567?text=");
    expect(link).toContain("%26");
    expect(link).not.toContain(" ");
  });
});
